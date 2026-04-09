import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Alert,
  BackHandler,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { ProgressChart } from "react-native-chart-kit";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingContext } from "../context/OnboardingContext";
import { useTheme } from '../context/ThemeContext';
import supabase from "../lib/supabase";
import { createFoodLog, deleteFoodLog, getFoodLogs } from "../utils/api";
import { getHomeScreenCache, invalidateHomeScreenCache, updateHomeScreenCacheOptimistic } from "../utils/cacheManager";
import { getTodayCaloriesBurned } from "../utils/calorieCalculator";
import { getFoodStreak, recalculateFoodStreak, updateFoodStreak } from "../utils/streakService";
import useTodaySteps from "../utils/useTodaySteps";

const screenWidth = Dimensions.get("window").width;

// Use centralized cache
const globalHomeCache = getHomeScreenCache();

// Import shared streak cache from MainDashboardScreen
let streakCache;
try {
  const mainDashboardModule = require('./MainDashboardScreen');
  streakCache = mainDashboardModule.streakCache || {
    lastFetch: 0,
    cachedStreak: null,
    CACHE_DURATION: 30000,
  };
} catch {
  // Fallback if import fails
  streakCache = {
    lastFetch: 0,
    cachedStreak: null,
    CACHE_DURATION: 30000,
  };
}

// Username cache to prevent re-fetching
export const userNameCache = {
  lastFetch: 0,
  cachedName: null,
  CACHE_DURATION: 300000, // 5 minutes
};

// Export for backward compatibility
export { invalidateHomeScreenCache, updateHomeScreenCacheOptimistic as updateHomeScreenCache };

// Memoized Header Component to prevent re-renders
const HomeHeader = React.memo(({ userName, selectedDate, navigation, styles, palette, themeKey }) => {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.greeting}>Hello, {userName}</Text>
        <Text style={styles.date}>
          {selectedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          })}
        </Text>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <TouchableOpacity 
          style={styles.headerButton} 
          onPress={() => navigation.navigate('ProgressScreen')}
        >
          <Ionicons name="stats-chart-outline" size={24} color={palette.primary} />
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Exercise')} 
          style={styles.headerButton}
        >
          <Ionicons name="barbell-outline" size={24} color={palette.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if userName or selectedDate actually changed
  return prevProps.userName === nextProps.userName && 
         prevProps.selectedDate.getTime() === nextProps.selectedDate.getTime() &&
         prevProps.themeKey === nextProps.themeKey;
});
HomeHeader.displayName = 'HomeHeader';

// Memoized Streak Badge Component
const StreakBadge = React.memo(({ calorieStreak, styles, themeKey }) => {
  return (
    <View style={styles.streakBadge}>
      <Text style={styles.streakEmoji}>🔥</Text>
      <Text style={styles.streakText}>
        {calorieStreak > 0 ? `${calorieStreak}-day streak` : '0-day streak'}
      </Text>
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if streak value changed
  return prevProps.calorieStreak === nextProps.calorieStreak &&
         prevProps.themeKey === nextProps.themeKey;
});
StreakBadge.displayName = 'StreakBadge';

// Add FooterBar component (same as MainDashboard)
const FooterBar = ({ navigation, activeTab, footerStyles, palette, themeKey }) => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const tabs = [
    {
      key: 'Home',
      label: 'Home',
      icon: <Ionicons name="home-outline" size={24} color={activeTab === 'Home' ? palette.primary : palette.navInactive} />,
      route: 'MainDashboard',
    },
    
    {
      key: 'Meals',
      label: 'Meals',
      icon: <Ionicons name="restaurant-outline" size={24} color={activeTab === 'Meals' ? palette.primary : palette.navInactive} />,
      route: 'Home',
    },
    {
      key: 'Workout',
      label: 'Saved',
      icon: <Ionicons name="fast-food-outline" size={24} color={activeTab === 'Workout' ? palette.primary : palette.navInactive} />,
      route: 'SavedMealsScreen',
    },
    {
      key: 'Profile',
      label: 'Profile',
      icon: <Ionicons name="person-outline" size={24} color={activeTab === 'Profile' ? palette.primary : palette.navInactive} />,
      route: 'Profile',
    },
  ];

  return (
    <View style={[footerStyles.container, { bottom: insets.bottom >= 20 ? (insets.bottom + 16) : 16 }]}>
      <View style={footerStyles.ovalFooter}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              footerStyles.tab,
              tab.key === activeTab && footerStyles.activeTab
            ]}
            onPress={() => {
              // Don't navigate if already on active tab
              if (tab.key === activeTab) return;
              
              navigation.navigate(tab.route);
            }}
            activeOpacity={0.7}
          >
            {React.cloneElement(tab.icon, {
              color: tab.key === activeTab ? palette.primary : palette.navInactive,
            })}
            <Text
              style={[
                footerStyles.label,
                tab.key === activeTab && footerStyles.activeLabel
              ]}
            >
              {tab.label}
            </Text>
            {tab.key === activeTab && <View style={footerStyles.activeIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

// Simple Plus Icon Component with Camera Above
const AnimatedPlusIcon = ({ navigation, plusStyles, palette }) => {
  const insets = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Simple shared values
  const voiceOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const voiceTranslateY = useSharedValue(0);
  const textTranslateY = useSharedValue(0);

  const handlePlusPress = () => {
    if (!isExpanded) {
      // Simple expand animation
      voiceTranslateY.value = withSpring(-60);
      textTranslateY.value = withSpring(-120);
      voiceOpacity.value = withTiming(1, { duration: 200 });
      textOpacity.value = withTiming(1, { duration: 200 });
      setIsExpanded(true);
    } else {
      // Simple collapse animation
      voiceTranslateY.value = withSpring(0);
      textTranslateY.value = withSpring(0);
      voiceOpacity.value = withTiming(0, { duration: 200 });
      textOpacity.value = withTiming(0, { duration: 200 });
      setIsExpanded(false);
    }
  };

  const handleVoicePress = () => {
    // Close and navigate
    voiceTranslateY.value = withSpring(0);
    textTranslateY.value = withSpring(0);
    voiceOpacity.value = withTiming(0, { duration: 150 });
    textOpacity.value = withTiming(0, { duration: 150 });
    setIsExpanded(false);
    
    setTimeout(() => {
      navigation.navigate('VoiceCalorieScreen', { mealType: 'Quick Log' });
    }, 150);
  };

  const handleTextPress = () => {
    // Close and navigate
    voiceTranslateY.value = withSpring(0);
    textTranslateY.value = withSpring(0);
    voiceOpacity.value = withTiming(0, { duration: 150 });
    textOpacity.value = withTiming(0, { duration: 150 });
    setIsExpanded(false);
    
    setTimeout(() => {
      navigation.navigate('QuickLogScreen', { mealType: 'Quick Log' });
    }, 150);
  };

  const handleCameraPress = () => {
    navigation.navigate('CustomCameraScreen');
  };

  // Simple animated styles
  const voiceAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: voiceTranslateY.value }],
      opacity: voiceOpacity.value,
    };
  });

  const textAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: textTranslateY.value }],
      opacity: textOpacity.value,
    };
  });

  // Calculate bottom position based on safe area insets and footer height
  const footerHeight = 80; // Approximate footer height
  const bottomPosition = Platform.OS === 'ios' 
    ? (insets.bottom >= 20 ? insets.bottom + footerHeight + 20 : footerHeight + 40)
    : (insets.bottom >= 20 ? insets.bottom + footerHeight + 10 : footerHeight + 30);

  return (
    <View style={[plusStyles.container, { bottom: bottomPosition }]}>
      {/* Voice Icon */}
      <Animated.View style={[plusStyles.expandedIcon, voiceAnimatedStyle]}>
        <TouchableOpacity
          style={[plusStyles.iconButton, { backgroundColor: palette.primary }]}
          onPress={handleVoicePress}
          activeOpacity={0.8}
        >
          <Ionicons name="mic" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Text Icon */}
      <Animated.View style={[plusStyles.expandedIcon, textAnimatedStyle]}>
        <TouchableOpacity
          style={[plusStyles.iconButton, { backgroundColor: palette.secondary }]}
          onPress={handleTextPress}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Camera Icon (above plus) */}
      <TouchableOpacity
        style={plusStyles.cameraButton}
        onPress={handleCameraPress}
        activeOpacity={0.8}
      >
        <Ionicons name="camera" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Main Plus Icon */}
      <TouchableOpacity
        style={plusStyles.plusButton}
        onPress={handlePlusPress}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

function getCurrentWeekDates() {
  const today = new Date();
  const week = [];
  // Get Monday of current week (Monday = 1, Sunday = 0, so we need to adjust)
  const monday = new Date(today);
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days
  monday.setDate(today.getDate() - daysToMonday);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push({
      date: d,
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNumber: d.getDate(),
      isToday:
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear(),
    });
  }
  return week;
}

const HomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets(); // For ScrollView padding
  const { colors, isDark } = useTheme();
  const palette = useMemo(() => createPalette(colors, isDark), [colors, isDark]);
  const themeKey = isDark ? 'dark' : 'light';
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const footerStyles = useMemo(() => createFooterStyles(palette), [palette]);
  const plusStyles = useMemo(() => createPlusStyles(palette), [palette]);
  const accentIconColor = isDark ? '#A1A6C2' : '#A9A9A9';
  const selectionBackground = isDark ? 'rgba(255,59,48,0.12)' : '#FFF3F3';
  const mealImageBackground = isDark ? '#2B2C3F' : '#F3F0FF';
  const nutritionBackgrounds = {
    protein: isDark ? 'rgba(34,197,94,0.12)' : '#E6F7EC',
    carbs: isDark ? 'rgba(255,145,0,0.12)' : '#FFF2E2',
    fat: isDark ? 'rgba(160,132,232,0.15)' : '#EEE8FF',
    fiber: isDark ? 'rgba(40,167,69,0.12)' : '#E8F5E8',
  };
  const [weekDates, setWeekDates] = useState(getCurrentWeekDates());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [user, setUser] = useState({ id: null });
  // Initialize with cached data if available (Instagram pattern)
  const [foodLogs, setFoodLogs] = useState(() => globalHomeCache.cachedData?.foodLogs || []);
  const [totals, setTotals] = useState(() => globalHomeCache.cachedData?.totals || {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });


  const [userName, setUserName] = useState(onboardingData?.name || "User");
  const [recentMeals, setRecentMeals] = useState(() => globalHomeCache.cachedData?.recentMeals || []);
  const [expandedMeal, setExpandedMeal] = useState(null);
  const [selectedMeals, setSelectedMeals] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  // Initialize streak from cache if available to prevent unnecessary updates
  const [calorieStreak, setCalorieStreak] = useState(() => {
    // Initialize from cache if available and fresh
    const now = Date.now();
    if (streakCache.cachedStreak !== null && (now - streakCache.lastFetch) < streakCache.CACHE_DURATION) {
      return streakCache.cachedStreak;
    }
    return 0;
  });
  const calorieStreakRef = React.useRef(calorieStreak); // Track current streak value to avoid unnecessary setState calls
  
  // Keep ref in sync with state
  React.useEffect(() => {
    calorieStreakRef.current = calorieStreak;
  }, [calorieStreak]);
  const [totalCaloriesBurned, setTotalCaloriesBurned] = useState(0);
  const [calorieBreakdown, setCalorieBreakdown] = useState({ steps: 0, workouts: 0, cardio: 0 });
  const { stepsToday, calories: stepCalories } = useTodaySteps();
  const { onboardingData } = useContext(OnboardingContext);

  // Calorie calculation helpers
  function calculateBMR(gender, weight_kg, height_cm, age) {
    return gender === "male"
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
  }
  function calculateTDEE(bmr, activity_level) {
    const multiplier = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very: 1.725,
      extra: 1.9,
    };
    return bmr * (multiplier[activity_level] || 1.2);
  }
  function adjustForGoal(tdee, goal) {
    switch (goal) {
      case "lose":
        return tdee * 0.85;
      case "gain":
        return tdee * 1.1;
      default:
        return tdee;
    }
  }
  function getMacroTargets(calories) {
    return {
      protein_g: Math.round((calories * 0.3) / 4),
      fat_g: Math.round((calories * 0.3) / 9),
      carbs_g: Math.round((calories * 0.4) / 4),
    };
  }
  function getMinCalories(gender) {
    return gender === "male" ? 1500 : 1200;
  }

  // Calorie goal logic
  const age = Number(onboardingData?.age) || 25;
  const gender = (onboardingData?.gender || "female").toLowerCase();
  const weight_kg = Number(onboardingData?.weight) || 60;
  const height_cm = Number(onboardingData?.height) || 165;
  const activity_level = (
    onboardingData?.daily_activity_level || "moderate"
  ).toLowerCase();
  let goal_type = (onboardingData?.goal_focus || "maintain").toLowerCase();
  if (goal_type.includes("lose")) goal_type = "lose";
  else if (goal_type.includes("gain")) goal_type = "gain";
  else goal_type = "maintain";

  const bmr = calculateBMR(gender, weight_kg, height_cm, age);
  const tdee = calculateTDEE(bmr, activity_level);
  let calorie_goal = adjustForGoal(tdee, goal_type);
  const minCalories = getMinCalories(gender);
  if (calorie_goal < minCalories) calorie_goal = minCalories;
  calorie_goal = Math.round(calorie_goal);
  const macro_targets = getMacroTargets(calorie_goal);
  const dailyGoal = calorie_goal;

  useEffect(() => {
    const fetchUserAndGoal = async () => {
      if (onboardingData.daily_calorie_goal) {
        calorie_goal = onboardingData.daily_calorie_goal;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUser({ id: session.user.id });

        // Check username cache first
        const now = Date.now();
        const timeSinceLastFetch = now - userNameCache.lastFetch;
        
        if (userNameCache.cachedName && timeSinceLastFetch < userNameCache.CACHE_DURATION) {
          // Use cached username
          setUserName(userNameCache.cachedName);
        } else {
          // Fetch user's name from database
          const { data: profileData } = await supabase
            .from("user_profile")
            .select("name")
            .eq("id", session.user.id)
            .single();

          if (profileData?.name) {
            userNameCache.cachedName = profileData.name;
            userNameCache.lastFetch = now;
            setUserName(profileData.name);
          }
        }
      }
    };
    fetchUserAndGoal();
  }, [onboardingData]);

  useEffect(() => {
    setWeekDates(getCurrentWeekDates());
  }, []);

  // Handle date changes - check cache first, don't clear state until new data arrives
  useEffect(() => {
    if (!user?.id || !selectedDate) return;
    
    const dateKey = selectedDate.toISOString().split('T')[0];
    const now = Date.now();
    const timeSinceLastFetch = now - globalHomeCache.lastFetchTime;
    const isFresh = timeSinceLastFetch < globalHomeCache.CACHE_DURATION;
    
    // Check if we have cached data for this specific date
    const cachedDataForDate = globalHomeCache.cachedData && globalHomeCache.cachedData.dateKey === dateKey;
    
    // If cache is valid for this date, restore from cache immediately (no flash of empty)
    if (cachedDataForDate && isFresh) {
      setFoodLogs(globalHomeCache.cachedData.foodLogs || []);
      setTotals(globalHomeCache.cachedData.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
      setRecentMeals(globalHomeCache.cachedData.recentMeals || []);
      return; // Cache is valid, no fetch needed
    }
    
    // If cache is for different date, invalidate it but DON'T clear state yet
    // Keep showing old data while fetching new data (prevents flash of empty)
    if (globalHomeCache.cachedData && globalHomeCache.cachedData.dateKey !== dateKey) {
      // Invalidate cache for the old date, but keep state until new data arrives
      globalHomeCache.cachedData = null;
      globalHomeCache.lastFetchTime = 0;
    }
    
    // Fetch fresh data - state will be updated when fetch completes
    fetchFoodLogs(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, user?.id]);
  
  // Handle back button - always navigate to MainDashboardScreen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigation.navigate('MainDashboard');
        return true; // Prevent default back behavior
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => backHandler.remove();
    }, [navigation])
  );

  // Use useFocusEffect with cache - Fixed to properly handle navigation (like MainDashboardScreen)
  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id || !selectedDate) return;
      
      const dateKey = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const now = Date.now();
      const timeSinceLastFetch = now - globalHomeCache.lastFetchTime;
      const isStale = timeSinceLastFetch > globalHomeCache.STALE_TIME;
      const isFresh = timeSinceLastFetch < globalHomeCache.CACHE_DURATION;
      
      // Check if cached data is for the current date
      const cachedDataForDate = globalHomeCache.cachedData && globalHomeCache.cachedData.dateKey === dateKey;
      
      // If cache is for different date, invalidate it but DON'T clear state
      // Keep showing old data while fetching new data (prevents flash of empty)
      if (globalHomeCache.cachedData && globalHomeCache.cachedData.dateKey !== dateKey) {
        globalHomeCache.cachedData = null;
        globalHomeCache.lastFetchTime = 0;
      }
      
      // SWR Pattern: Stale-While-Revalidate (like Instagram/MainDashboardScreen)
      // ONLY use cache if it's for the EXACT same date
      if (cachedDataForDate && isFresh) {
        // Data is fresh for this date - restore from cache immediately, no revalidation needed
        setFoodLogs(globalHomeCache.cachedData.foodLogs || []);
        setTotals(globalHomeCache.cachedData.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
        setRecentMeals(globalHomeCache.cachedData.recentMeals || []);
        globalHomeCache.cacheHits++;
        
        // Still fetch calories burned and streak (these are lightweight)
        fetchCaloriesBurned();
        const loadStreak = async () => {
          try {
            const streakNow = Date.now();
            const streakTimeSinceLastFetch = streakNow - streakCache.lastFetch;
            
            if (streakCache.cachedStreak !== null && streakTimeSinceLastFetch < streakCache.CACHE_DURATION) {
              // Only update state if value actually changed (like ExerciseScreen pattern)
              const cachedValue = streakCache.cachedStreak;
              if (cachedValue !== calorieStreakRef.current) {
                calorieStreakRef.current = cachedValue;
                setCalorieStreak(cachedValue);
              }
              return;
            }
            
            const currentStreak = await getFoodStreak(user.id);
            streakCache.cachedStreak = currentStreak;
            streakCache.lastFetch = streakNow;
            // Only update state if value actually changed (like ExerciseScreen pattern)
            if (currentStreak !== calorieStreakRef.current) {
              calorieStreakRef.current = currentStreak;
              setCalorieStreak(currentStreak);
            }
          } catch (error) {
            console.error('Error loading streak:', error);
          }
        };
        loadStreak();
        return; // Fresh cache - no fetch needed
      }
      
      if (cachedDataForDate && isStale && !isFresh) {
        // Data is stale but within cache duration - show stale data immediately, revalidate in background
        setFoodLogs(globalHomeCache.cachedData.foodLogs || []);
        setTotals(globalHomeCache.cachedData.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
        setRecentMeals(globalHomeCache.cachedData.recentMeals || []);
        globalHomeCache.cacheHits++;
        // Continue to fetch fresh data in background (don't return)
      }
      
      // Prevent concurrent fetches
      if (globalHomeCache.isFetching) return;
      
      // Cache is invalid, missing, or for different date - fetch fresh data
      // State will be updated when fetch completes (no flash of empty)
      fetchFoodLogs(selectedDate);
      fetchCaloriesBurned();
      
      // Reload streak with caching
      const loadStreak = async () => {
        try {
          const streakNow = Date.now();
          const streakTimeSinceLastFetch = streakNow - streakCache.lastFetch;
          
          if (streakCache.cachedStreak !== null && streakTimeSinceLastFetch < streakCache.CACHE_DURATION) {
            // Only update state if value actually changed (like ExerciseScreen pattern)
            // Use ref to get current value to avoid stale closure
            const cachedValue = streakCache.cachedStreak;
            if (cachedValue !== calorieStreakRef.current) {
              calorieStreakRef.current = cachedValue;
              setCalorieStreak(cachedValue);
            }
            return;
          }
          
          const currentStreak = await getFoodStreak(user.id);
          streakCache.cachedStreak = currentStreak;
          streakCache.lastFetch = streakNow;
          // Only update state if value actually changed (like ExerciseScreen pattern)
          // Use ref to get current value to avoid stale closure
          if (currentStreak !== calorieStreakRef.current) {
            calorieStreakRef.current = currentStreak;
            setCalorieStreak(currentStreak);
          }
        } catch (error) {
          console.error('Error loading streak:', error);
        }
      };
      loadStreak();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, selectedDate])
  );

  const fetchCaloriesBurned = async () => {
    if (!user?.id) return;
    
    try {
      const userProfile = {
        weight: weight_kg,
        height: height_cm,
        age: age,
        gender: gender,
      };
      
      const caloriesData = await getTodayCaloriesBurned(user.id, userProfile, selectedDate);
      setTotalCaloriesBurned(caloriesData.total);
      setCalorieBreakdown({
        steps: caloriesData.steps,
        workouts: caloriesData.workouts,
        cardio: caloriesData.cardio,
      });
    } catch (error) {
      console.error('Error fetching calories burned:', error);
    }
  };

  const fetchFoodLogs = async (date) => {
    // Create a unique cache key for each date
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // CRITICAL: If cache is for a different date, invalidate it immediately
    if (globalHomeCache.cachedData && globalHomeCache.cachedData.dateKey !== dateKey) {
      globalHomeCache.cachedData = null;
      globalHomeCache.lastFetchTime = 0;
    }
    
    const now = Date.now();
    const timeSinceLastFetch = now - globalHomeCache.lastFetchTime;
    const isStale = timeSinceLastFetch > globalHomeCache.STALE_TIME;
    const isFresh = timeSinceLastFetch < globalHomeCache.CACHE_DURATION;
    
    // Check if we have cached data for this specific date
    const cachedDataForDate = globalHomeCache.cachedData && globalHomeCache.cachedData.dateKey === dateKey;
    
    // SWR Pattern: Stale-While-Revalidate (like Instagram)
    // ONLY use cache if it's for the EXACT same date
    if (cachedDataForDate && isFresh) {
      // Data is fresh for this date - use cache, no revalidation needed
      setFoodLogs(globalHomeCache.cachedData.foodLogs || []);
      setTotals(globalHomeCache.cachedData.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
      setRecentMeals(globalHomeCache.cachedData.recentMeals || []);
      globalHomeCache.cacheHits++;
      return; // Fresh cache - no fetch needed
    }
    
    if (cachedDataForDate && isStale && !isFresh) {
      // Data is stale but within cache duration - show stale, revalidate in background
      setFoodLogs(globalHomeCache.cachedData.foodLogs || []);
      setTotals(globalHomeCache.cachedData.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
      setRecentMeals(globalHomeCache.cachedData.recentMeals || []);
      globalHomeCache.cacheHits++;
      // Continue to fetch fresh data in background (don't return)
    }
    
    // Prevent concurrent fetches
    if (globalHomeCache.isFetching) return;
    
    globalHomeCache.isFetching = true;
    globalHomeCache.cacheMisses++;
    
    try {
      const logs = await getFoodLogs(user.id);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      const filteredLogs = logs.filter((log) => {
        const logDate = new Date(log.created_at);
        return logDate >= startOfDay && logDate <= endOfDay;
      });
      setFoodLogs(filteredLogs);
      
      // Calculate totals
      const newTotals = filteredLogs.reduce(
        (acc, log) => {
          acc.calories += log.calories || 0;
          acc.protein += log.protein || 0;
          acc.carbs += log.carbs || 0;
          acc.fat += log.fat || 0;
          acc.fiber += log.fiber || 0;
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      );
      setTotals(newTotals);
      
      // Resolve signed URLs for recent meals
      const recent = filteredLogs.slice(-5).reverse();
      const withUrls = await Promise.all(recent.map(async (meal) => {
        if (meal.photo_url && !meal.photo_url.startsWith('http')) {
          try {
            const { data } = await supabase.storage
              .from('food-photos')
              .createSignedUrl(meal.photo_url, 60 * 60);
            return { ...meal, photo_url: data?.signedUrl || meal.photo_url };
          } catch {
            return meal;
          }
        }
        return meal;
      }));
      setRecentMeals(withUrls);
      
      // Cache the data with date key
      globalHomeCache.cachedData = {
        foodLogs: filteredLogs,
        totals: newTotals,
        recentMeals: withUrls,
        dateKey: dateKey, // Store the date key for cache validation
      };
      
      // Update cache timestamp
      globalHomeCache.lastFetchTime = Date.now();

      // Update and get food streak from database
      if (user.id && filteredLogs.length > 0) {
        await updateFoodStreak(user.id);
        const currentStreak = await getFoodStreak(user.id);
        // Update cache
        streakCache.cachedStreak = currentStreak;
        streakCache.lastFetch = Date.now();
        // Only update state if value actually changed
        // Use ref to get current value to avoid stale closure
        if (currentStreak !== calorieStreakRef.current) {
          calorieStreakRef.current = currentStreak;
          setCalorieStreak(currentStreak);
        }
      } else if (user.id) {
        // Just get current streak if no logs today
        const currentStreak = await getFoodStreak(user.id);
        // Update cache
        streakCache.cachedStreak = currentStreak;
        streakCache.lastFetch = Date.now();
        // Only update state if value actually changed
        // Use ref to get current value to avoid stale closure
        if (currentStreak !== calorieStreakRef.current) {
          calorieStreakRef.current = currentStreak;
          setCalorieStreak(currentStreak);
        }
      }
    } catch (error) {
      console.error("Error fetching food logs:", error);
    } finally {
      globalHomeCache.isFetching = false;
    }
  };

  const calculateTotals = (logs) => {
    const newTotals = logs.reduce(
      (acc, log) => {
        acc.calories += log.calories || 0;
        acc.protein += log.protein || 0;
        acc.carbs += log.carbs || 0;
        acc.fat += log.fat || 0;
        acc.fiber += log.fiber || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
    setTotals(newTotals);
  };

  const launchImagePicker = async (pickerFunction, mealType) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required.");
      return;
    }
    const result = await pickerFunction({
      allowsEditing: false,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled) {
      navigation.navigate("PhotoCalorieScreen", {
        photoUri: result.assets[0].uri,
        mealType,
      });
    }
  };

  const showImagePickerOptions = (mealType) => {
    Alert.alert(
      "Log Food with Photo",
      "Choose an option",
      [
        {
          text: "Take a photo",
          onPress: () =>
            launchImagePicker(ImagePicker.launchCameraAsync, mealType),
        },
        {
          text: "Choose from Library",
          onPress: () =>
            launchImagePicker(ImagePicker.launchImageLibraryAsync, mealType),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ],
      { cancelable: true }
    );
  };

  const handleLogFood = async (mealType, nutritionData) => {
    if (!nutritionData) return;
    try {
      const logData = {
        meal_type: mealType,
        food_name: nutritionData.food_name,
        calories: nutritionData.calories,
        protein: nutritionData.protein,
        carbs: nutritionData.carbs,
        fat: nutritionData.fat,
        user_id: user.id,
      };
      const {
        data: { session },
      } = await supabase.auth.getSession();
      logData.user_id = session?.user?.id;
      if (!logData.user_id) {
        Alert.alert("You must be logged in to log food.");
        return;
      }
      await createFoodLog(logData);
      fetchFoodLogs(selectedDate);
      
      Alert.alert(
        "Food Logged! 🍽️",
        "Your meal has been successfully logged.",
        [{ text: "Great!", style: "default" }]
      );
      
    } catch (error) {
      console.error("Error logging food:", error);
      Alert.alert("Error", "Failed to log food.");
    }
  };

  const openVoiceModal = (mealType) => {
    navigation.navigate("VoiceCalorieScreen", { mealType, selectedDate });
  };

  const handleMealLongPress = (mealId) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedMeals(new Set([mealId]));
    }
  };

  const handleMealPress = (mealId, index) => {
    if (isSelectionMode) {
      const newSelected = new Set(selectedMeals);
      if (newSelected.has(mealId)) {
        newSelected.delete(mealId);
        if (newSelected.size === 0) {
          setIsSelectionMode(false);
        }
      } else {
        newSelected.add(mealId);
      }
      setSelectedMeals(newSelected);
    } else {
      setExpandedMeal(expandedMeal === index ? null : index);
    }
  };

  const handleDeleteSelected = async () => {
    try {
      const selectedIds = Array.from(selectedMeals);
      await Promise.all(selectedIds.map(id => deleteFoodLog(id)));
      
      // Clear cache to force fresh data fetch
      globalHomeCache.cachedData = null;
      globalHomeCache.lastFetchTime = 0;
      
      // Also invalidate main dashboard cache to keep everything in sync
      invalidateHomeScreenCache();
      
      // Refresh data from database
      await fetchFoodLogs(selectedDate);
      
      // Recalculate streak from scratch based on remaining logs
      console.log('🔄 Recalculating streak after deletion...');
      await recalculateFoodStreak(user.id);
      
      // Get updated streak and display it
      const updatedStreak = await getFoodStreak(user.id);
      // Invalidate and update streak cache
      streakCache.cachedStreak = updatedStreak;
      streakCache.lastFetch = Date.now();
      // Only update state if value actually changed
      // Use ref to get current value to avoid stale closure
      if (updatedStreak !== calorieStreakRef.current) {
        calorieStreakRef.current = updatedStreak;
        setCalorieStreak(updatedStreak);
      }
      
      setSelectedMeals(new Set());
      setIsSelectionMode(false);
      
      Alert.alert("Success", "Selected meals deleted successfully.");
    } catch (e) {
      console.error('Error in handleDeleteSelected:', e);
      Alert.alert("Error", "Failed to delete selected meals.");
    }
  };

  const renderMealSection = (mealType, iconName, time) => (
    <View style={styles.mealSection}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={styles.mealIconContainer}>
        <Ionicons name={iconName} size={20} color={palette.primary} />
        </View>
        <View>
          <Text style={styles.mealTitle}>{mealType}</Text>
          <Text style={styles.mealTime}>{time}</Text>
        </View>
      </View>
      <View style={styles.mealActions}>
        <TouchableOpacity
          style={styles.mealButton}
          onPress={() => showImagePickerOptions(mealType)}
        >
          <Ionicons name="camera-outline" size={24} color={accentIconColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mealButton}
          onPress={() => openVoiceModal(mealType)}
        >
          <Ionicons name="mic-outline" size={24} color={accentIconColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mealButton, styles.mealAddButton]}
          onPress={() =>
            navigation.navigate("ManualLogScreen", {
              mealType,
              selectedDate: selectedDate.toISOString(),
            })
          }
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const calorieProgress = dailyGoal > 0 ? totals.calories / dailyGoal : 0;
  const progressChartData = {
    data: [calorieProgress > 1 ? 1 : calorieProgress],
  };

  const calorieBalance = dailyGoal - totals.calories;
  const balanceSign = calorieBalance > 0 ? "+" : calorieBalance < 0 ? "-" : "";
  const balanceDisplay = `${balanceSign}${Math.abs(calorieBalance)}`;
  // Use comprehensive calories (steps + workouts + cardio)
  const caloriesBurned = totalCaloriesBurned || 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="auto" />
      <ScrollView showsVerticalScrollIndicator={false}>
      <HomeHeader
        userName={userName}
        selectedDate={selectedDate}
        navigation={navigation}
        styles={styles}
        palette={palette}
        themeKey={themeKey}
      />

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginVertical: 12,
            paddingHorizontal: 10,
          }}
        >
          {weekDates.map((d, i) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateToCheck = new Date(d.date);
            dateToCheck.setHours(0, 0, 0, 0);
            const isFutureDate = dateToCheck > today;

            const isSelected =
              selectedDate.getDate() === d.date.getDate() &&
              selectedDate.getMonth() === d.date.getMonth() &&
              selectedDate.getFullYear() === d.date.getFullYear();

            return (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  if (!isFutureDate) {
                    setSelectedDate(d.date);
                    // Don't clear cache here - let useEffect handle it with proper cache validation
                  }
                }}
                style={{ alignItems: "center", flex: 1 }}
                disabled={isFutureDate}
              >
                <View
                  style={{
                    backgroundColor: isSelected
                      ? palette.primary
                      : isFutureDate
                      ? palette.border
                      : palette.highlight,
                    borderRadius: 24,
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    minWidth: 44,
                    opacity: isFutureDate ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? "#fff"
                        : isFutureDate
                        ? palette.disabledText
                        : palette.textSecondary,
                      fontFamily: "Lexend-SemiBold",
                      fontSize: 14,
                      textAlign: "center",
                    }}
                  >
                    {d.dayName}
                  </Text>
                  <Text
                    style={{
                      color: isSelected
                        ? "#fff"
                        : isFutureDate
                        ? palette.disabledText
                        : palette.textPrimary,
                      fontFamily: "Lexend-Bold",
                      fontSize: 18,
                      textAlign: "center",
                    }}
                  >
                    {d.dayNumber}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.cardTitle}>Today&apos;s Summary</Text>
            <TouchableOpacity style={styles.dateChip}>
              <Ionicons name="calendar-outline" size={16} color={palette.primary} />
              <Text style={styles.dateChipText}>
                {selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.summaryBody}>
            <View style={styles.caloriesInfo}>
              <Text style={styles.caloriesCount}>
                {totals.calories.toFixed(0)}
              </Text>
              <Text style={styles.caloriesUnit}>
                kcal / {dailyGoal.toFixed(0)}
              </Text>
            </View>
            <View style={styles.progressContainer}>
              <ProgressChart
                data={progressChartData}
                width={100}
                height={100}
                strokeWidth={10}
                radius={40}
                chartConfig={{
                  backgroundGradientFrom: palette.card,
                  backgroundGradientTo: palette.card,
                  color: () => palette.primary,
                  propsForLabels: {
                    fontSize: 0,
                  },
                }}
                hideLegend
              />
              <Text style={styles.progressText}>
                {(calorieProgress * 100).toFixed(0)}%
              </Text>
            </View>
          </View>
          <View style={styles.pillRow}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <View style={[styles.pill, styles.pillBurned]}>
                <Text style={styles.pillLabel}>Calories Burned</Text>
                <Text style={styles.pillValueBurned}>{caloriesBurned}</Text>
              </View>
              <View style={[styles.pill, styles.pillBalance]}>
                <Text style={styles.pillLabel}>Balance</Text>
                <Text style={styles.pillValueBalance}>{balanceDisplay}</Text>
              </View>
            </View>
            <StreakBadge calorieStreak={calorieStreak} styles={styles} themeKey={themeKey} />
          </View>
        </View>

        <View style={styles.macroGrid}>
          <View style={styles.macroRow}>
            <View style={[styles.macroCard, { marginRight: 12 }]}>
              <View style={styles.macroCardTopRow}>
                <Ionicons
                  name="barbell"
                  size={28}
                  color={palette.textPrimary}
                  style={styles.macroIconLarge}
                />
                <Text style={styles.macroTitle}>Protein</Text>
              </View>
              <Text style={styles.macroValueLarge}>
                {totals.protein?.toFixed(0) || 0}g
              </Text>
              <View style={styles.macroDivider} />
              <Text style={styles.macroGoalSmall}>
                Goal: {macro_targets.protein_g}g
              </Text>
            </View>
            <View style={styles.macroCard}>
              <View style={styles.macroCardTopRow}>
                <Ionicons
                  name="nutrition"
                  size={28}
                  color={palette.textPrimary}
                  style={styles.macroIconLarge}
                />
                <Text style={styles.macroTitle}>Carbs</Text>
              </View>
              <Text style={styles.macroValueLarge}>
                {totals.carbs?.toFixed(0) || 0}g
              </Text>
              <View style={styles.macroDivider} />
              <Text style={styles.macroGoalSmall}>
                Goal: {macro_targets.carbs_g}g
              </Text>
            </View>
          </View>
          <View style={styles.macroRow}>
            <View style={styles.macroCard}>
              <View style={styles.macroCardTopRow}>
                <Ionicons
                  name="leaf"
                  size={28}
                  color={palette.textPrimary}
                  style={styles.macroIconLarge}
                />
                <Text style={styles.macroTitle}>Fat</Text>
              </View>
              <Text style={styles.macroValueLarge}>
                {totals.fat?.toFixed(0) || 0}g
              </Text>
              <View style={styles.macroDivider} />
              <Text style={styles.macroGoalSmall}>
                Goal: {macro_targets.fat_g}g
              </Text>
            </View>
            <View style={styles.macroCard}>
              <View style={styles.macroCardTopRow}>
                <Ionicons
                  name="restaurant"
                  size={28}
                  color={palette.textPrimary}
                  style={styles.macroIconLarge}
                />
                <Text style={styles.macroTitle}>Fiber</Text>
              </View>
              <Text style={styles.macroValueLarge}>
                {Math.round(totals.fiber)}g
              </Text>
              <View style={styles.macroDivider} />
              <Text style={styles.macroGoalSmall}>Goal: 30g</Text>
            </View>
          </View>
        </View>
        {/* Recent Meals Section */}
        <View
          style={{ marginHorizontal: 20, marginBottom: 30, paddingBottom: Math.max(80, (insets.bottom >= 20 ? insets.bottom + 16 : 16) + 60) }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text
              style={{
                fontFamily: "Lexend-SemiBold",
                fontSize: 18,
                color: palette.textPrimary,
              }}
            >
              Recent Meals
            </Text>
            {isSelectionMode && selectedMeals.size > 0 && (
              <TouchableOpacity
                onPress={handleDeleteSelected}
                style={{
                  backgroundColor: palette.destructive,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600' }}>
                  Delete ({selectedMeals.size})
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {recentMeals.length === 0 ? (
            <Text
              style={{
                fontFamily: "Manrope-Regular",
                fontSize: 15,
                color: palette.textSecondary,
              }}
            >
              No meals logged yet today.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {recentMeals.map((meal, i) => (
                <TouchableOpacity
                  key={meal.id || i}
                  onPress={() => handleMealPress(meal.id, i)}
                  onLongPress={() => handleMealLongPress(meal.id)}
                  style={{
                    backgroundColor: selectedMeals.has(meal.id) ? selectionBackground : palette.card,
                    borderRadius: 16,
                    padding: 12,
                    shadowColor: palette.shadow,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.06,
                    shadowRadius: 10,
                    elevation: 4,
                    transform: [{ scale: expandedMeal === i ? 1.02 : 1 }],
                    borderWidth: selectedMeals.has(meal.id) ? 2 : 0,
                    borderColor: selectedMeals.has(meal.id) ? palette.destructive : "transparent",
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {/* Meal Image */}
                    {meal.photo_url && meal.photo_url.startsWith('http') ? (
                      <Image
                        source={{ uri: meal.photo_url }}
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 12,
                          backgroundColor: mealImageBackground,
                        }}
                      />
                    ) : (
                      <Image
                        source={{
                          uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop",
                        }}
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 12,
                          backgroundColor: mealImageBackground,
                        }}
                        defaultSource={{
                          uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop",
                        }}
                      />
                    )}

                    {/* Meal Details */}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={{
                          fontFamily: "Lexend-SemiBold",
                          fontSize: 16,
                          color: palette.textPrimary,
                          marginBottom: 4,
                        }}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {meal.food_name || meal.meal_type || "Meal"}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Manrope-Regular",
                          fontSize: 14,
                          color: palette.textSecondary,
                        }}
                      >
                        {meal.calories ? `${meal.calories} kcal` : "-- kcal"}
                      </Text>
                    </View>

                    {/* Selection indicator */}
                    {isSelectionMode && (
                      <View style={{ padding: 6 }}>
                        <Ionicons
                          name={selectedMeals.has(meal.id) ? "checkmark-circle" : "ellipse-outline"}
                          size={24}
                          color={selectedMeals.has(meal.id) ? palette.destructive : palette.border}
                        />
                      </View>
                    )}
                  </View>

                  {/* Expanded Nutrition Details - Inside the same card */}
                  {expandedMeal === i && (
                    <View
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: palette.border,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Lexend-SemiBold",
                          fontSize: 14,
                          color: palette.textPrimary,
                          marginBottom: 8,
                        }}
                      >
                        Nutrition Details
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                        }}
                      >
                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: nutritionBackgrounds.protein,
                            borderRadius: 8,
                            padding: 8,
                            minWidth: "22%",
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Manrope-Bold",
                              fontSize: 12,
                              color: palette.success,
                            }}
                          >
                            Protein
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Lexend-SemiBold",
                              fontSize: 14,
                              color: palette.success,
                            }}
                          >
                            {meal.protein || 0}g
                          </Text>
                        </View>

                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: nutritionBackgrounds.carbs,
                            borderRadius: 8,
                            padding: 8,
                            minWidth: "22%",
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Manrope-Bold",
                              fontSize: 12,
                              color: palette.warning,
                            }}
                          >
                            Carbs
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Lexend-SemiBold",
                              fontSize: 14,
                              color: palette.warning,
                            }}
                          >
                            {meal.carbs || 0}g
                          </Text>
                        </View>

                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: nutritionBackgrounds.fat,
                            borderRadius: 8,
                            padding: 8,
                            minWidth: "22%",
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Manrope-Bold",
                              fontSize: 12,
                              color: palette.secondary,
                            }}
                          >
                            Fat
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Lexend-SemiBold",
                              fontSize: 14,
                              color: palette.secondary,
                            }}
                          >
                            {meal.fat || 0}g
                          </Text>
                        </View>

                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: nutritionBackgrounds.fiber,
                            borderRadius: 8,
                            padding: 8,
                            minWidth: "22%",
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Manrope-Bold",
                              fontSize: 12,
                              color: palette.success,
                            }}
                          >
                            Fiber
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Lexend-SemiBold",
                              fontSize: 14,
                              color: palette.success,
                            }}
                          >
                            {meal.fiber || 0}g
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      
      {/* Footer Bar */}
      <FooterBar navigation={navigation} activeTab="Meals" footerStyles={footerStyles} palette={palette} themeKey={themeKey} />
      
      {/* Animated Plus Icon with Camera Above */}
      <AnimatedPlusIcon navigation={navigation} plusStyles={plusStyles} palette={palette} />
    </SafeAreaView>
  );
};

const createPalette = (colors, isDark) => ({
  primary: colors.primary,
  secondary: '#A084E8',
  background: colors.background,
  card: colors.cardBackground,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  border: colors.border,
  shadow: colors.shadow || '#000',
  navInactive: isDark ? '#9CA3AF' : '#232B3A',
  chipBackground: isDark ? '#2A2A3E' : '#e9ecef',
  chipText: colors.textSecondary,
  highlight: isDark ? '#1F2033' : '#F8F9FF',
  mutedCard: isDark ? '#1E1F2C' : '#F6F6F6',
  destructive: '#FF3B30',
  warning: '#FF9800',
  success: '#22C55E',
  balance: '#1abc9c',
  navBackground: isDark ? 'rgba(18, 18, 27, 0.95)' : 'rgba(255, 255, 255, 0.95)',
  navBackgroundIOS: isDark ? 'rgba(18, 18, 27, 0.85)' : 'rgba(255, 255, 255, 0.85)',
  pillTrack: isDark ? '#2B2C3F' : '#E6F9ED',
  pillBurned: isDark ? 'rgba(255, 152, 0, 0.15)' : '#FFF4E0',
  pillBalance: isDark ? 'rgba(26, 188, 156, 0.15)' : '#E6F9ED',
  chartBackground: colors.cardBackground,
  disabledText: isDark ? '#6B7280' : '#888',
});

const createStyles = (palette, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: { fontSize: 24, fontWeight: "bold", color: palette.textPrimary },
  date: { fontSize: 16, color: palette.textSecondary },
  headerButton: {
    marginLeft: 16,
    backgroundColor: palette.highlight,
    padding: 8,
    borderRadius: 20,
  },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: palette.textPrimary },
  summaryCard: {
    backgroundColor: palette.card,
    margin: 20,
    marginTop: 10,
    padding: 16,
    borderRadius: 15,
    elevation: 2,
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.chipBackground,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  dateChipText: { color: palette.primary, fontWeight: "bold", marginLeft: 6 },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : "#FEF3F2",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  streakEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  streakText: {
    fontFamily: "Lexend-SemiBold",
    fontSize: 12,
    color: palette.textPrimary,
  },
  summaryBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  caloriesInfo: { alignItems: "flex-start" },
  caloriesCount: { fontSize: 40, fontWeight: "bold", color: palette.textPrimary },
  caloriesUnit: { fontSize: 16, color: palette.textSecondary, marginTop: -5 },
  progressContainer: { justifyContent: "center", alignItems: "center" },
  progressText: {
    position: "absolute",
    fontSize: 18,
    fontWeight: "bold",
    color: palette.primary,
  },
  pillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginRight: 8,
    minWidth: 0,
  },
  pillBurned: {
    backgroundColor: palette.pillBurned,
  },
  pillBalance: {
    backgroundColor: palette.pillBalance,
  },
  pillLabel: {
    fontSize: 10,
    color: palette.textMuted,
    fontWeight: "500",
    marginRight: 3,
  },
  pillValueBurned: {
    fontSize: 12,
    fontWeight: "bold",
    color: palette.warning,
  },
  pillValueBalance: {
    fontSize: 12,
    fontWeight: "bold",
    color: palette.balance,
  },
  macroGrid: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  macroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  macroCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 12,
    width: "45%",
    minHeight: 90,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 0,
  },
  macroCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  macroIconLarge: {
    marginRight: 7,
    fontSize: 22,
    color: palette.textPrimary,
  },
  macroTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.textPrimary,
  },
  macroValueLarge: {
    fontSize: 24,
    fontWeight: "bold",
    color: palette.textPrimary,
    textAlign: "left",
    marginVertical: 1,
  },
  macroDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 6,
    width: "100%",
  },
  macroGoalSmall: {
    fontSize: 11,
    color: palette.textSecondary,
    textAlign: "left",
  },
  mealSection: {
    backgroundColor: palette.card,
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 16,
    borderRadius: 15,
    elevation: 2,
    shadowColor: palette.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.highlight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  mealTitle: { fontSize: 16, fontWeight: "bold", color: palette.textPrimary },
  mealTime: { fontSize: 12, color: palette.textSecondary },
  mealActions: { flexDirection: "row", alignItems: "center" },
  mealButton: { padding: 4, marginHorizontal: 4 },
  mealAddButton: { backgroundColor: palette.primary, borderRadius: 15, padding: 6 },
  activityCard: {
    backgroundColor: palette.card,
    margin: 20,
    marginTop: 10,
    padding: 16,
    borderRadius: 15,
    elevation: 2,
    shadowColor: palette.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  workoutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.highlight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  workoutButtonText: {
    color: palette.primary,
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 14,
  },
  activityBody: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  activityItem: { alignItems: "center" },
  activityValue: { fontSize: 18, fontWeight: "bold", marginTop: 4, color: palette.textPrimary },
  activityUnit: { fontSize: 12, color: palette.textSecondary },
});

const createFooterStyles = (palette) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    zIndex: 100,
  },
  ovalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    backgroundColor: palette.navBackground,
    borderRadius: 35,
    paddingVertical: 16,
    paddingHorizontal: 20,
    ...(Platform.OS === 'ios' && {
      backgroundColor: palette.navBackgroundIOS,
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'relative',
  },
  label: {
    fontSize: 12,
    marginTop: 4,
    color: palette.navInactive,
    letterSpacing: 0.1,
    fontWeight: '500',
  },
  activeLabel: {
    color: palette.primary,
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 30,
    height: 3,
    backgroundColor: palette.primary,
    borderRadius: 2,
  },
});

const createPlusStyles = (palette) => StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  plusButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cameraButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1abc9c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#1abc9c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  expandedIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    paddingBottom: 50,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});

export default React.memo(HomeScreen);