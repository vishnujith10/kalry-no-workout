import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DailyCheckInModal } from '../components/DailyCheckInModal';
import { OnboardingContext } from '../context/OnboardingContext';
import { useTheme } from '../context/ThemeContext';
import supabase from '../lib/supabase';
import { getFoodLogs } from '../utils/api';
import { getMainDashboardCache, invalidateMainDashboardCache, updateMainDashboardCacheOptimistic } from '../utils/cacheManager';
import { getFoodStreak } from '../utils/streakService';
import useTodaySteps from '../utils/useTodaySteps';

// Use centralized cache
const globalCache = getMainDashboardCache();

// Streak cache to prevent unnecessary re-fetches
export const streakCache = {
  lastFetch: 0,
  cachedStreak: null,
  CACHE_DURATION: 30000, // 30 seconds
  _listeners: new Set(), // For notifying listeners of streak updates
};

// Export for backward compatibility
export { invalidateMainDashboardCache, updateMainDashboardCacheOptimistic as updateMainDashboardCache };

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
const RADIUS = { sm: 6, md: 12, lg: 24, xl: 32, full: 9999 };

// --- Kalry Calorie Calculation System ---
function calculateBMR(gender, weight_kg, height_cm, age) {
  return gender === 'male'
    ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
}
function calculateTDEE(bmr, activity_level) {
  const multiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very: 1.725,
    extra: 1.9
  };
  return bmr * (multiplier[activity_level] || 1.2);
}
function adjustForGoal(tdee, goal) {
  switch (goal) {
    case 'lose': return tdee * 0.85;
    case 'gain': return tdee * 1.10;
    default: return tdee;
  }
}
function getMacroTargets(calories) {
  return {
    protein_g: Math.round((calories * 0.3) / 4),
    fat_g: Math.round((calories * 0.3) / 9),
    carbs_g: Math.round((calories * 0.4) / 4)
  };
}
function getMinCalories(gender) {
  return gender === 'male' ? 1500 : 1200;
}
// --- End Calorie Calculation System ---

// Add a list of quotes for daily rotation
const QUOTES = [
  'Discipline is remembering what you want.',
  'Small steps every day.',
  'Progress, not perfection.',
  'You are stronger than you think.',
  'Consistency is key.',
  'Your only limit is you.',
  'Stay positive, work hard, make it happen.',
  'Every day is a fresh start.',
  'Believe in yourself.',
  'Success is the sum of small efforts.'
];

const getTodaysQuote = () => {
  const day = new Date().getDate();
  return QUOTES[day % QUOTES.length];
};

// Memoized Streak Badge Component - optimized to prevent unnecessary re-renders
// Always renders (like ExerciseScreen) - shows "0-day streak" when streak is 0
const StreakBadge = React.memo(({ calorieStreak }) => {
  const { colors, isDark } = useTheme();
  const streakStyles = React.useMemo(
    () => createStreakStyles(colors, isDark),
    [colors, isDark]
  );

  return (
    <View style={streakStyles.badge}>
      <Text style={streakStyles.emoji}>🔥</Text>
      <Text style={streakStyles.text}>
        {calorieStreak > 0 ? `${calorieStreak}-day streak` : '0-day streak'}
      </Text>
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if streak value actually changed (strict equality check)
  return prevProps.calorieStreak === nextProps.calorieStreak;
});
StreakBadge.displayName = 'StreakBadge';

// Add FooterBar component before MainDashboardScreen
const FooterBar = ({ navigation, activeTab }) => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const { colors, isDark } = useTheme();
  const footerStyles = React.useMemo(
    () => createFooterStyles(colors, isDark),
    [colors, isDark]
  );
  const activeColor = colors.primary || '#7B61FF';
  const inactiveColor = isDark ? colors.textSecondary || '#9CA3AF' : '#232B3A';

  const tabs = [
    {
      key: 'Home',
      label: 'Home',
      icon: <Ionicons name="home-outline" size={24} color={activeColor} />,
      route: 'MainDashboard',
    },
    
    {
      key: 'Meals',
      label: 'Meals',
      icon: <Ionicons name="restaurant-outline" size={24} color={inactiveColor} />, // icon size 24
      route: 'Home',
    },
    {
      key: 'Workout',
      label: 'Workout',
      icon: <Ionicons name="barbell-outline" size={24} color={activeColor} />,
      route: 'Exercise',
    },
    {
      key: 'Profile',
      label: 'Profile',
      icon: <Ionicons name="person-outline" size={24} color={activeColor} />,
      route: 'Profile',
    },
  ];

  return (
    <View style={[footerStyles.container, { bottom: insets.bottom >= 20 ? (insets.bottom + 16) : 16 }]}>
      <View style={footerStyles.ovalFooter}>
        {tabs.map(tab => {
          const tabColor = tab.key === activeTab ? activeColor : inactiveColor;
          return (
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
                color: tabColor,
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
          );
        })}
      </View>
    </View>
  );
};

const MainDashboardScreen = ({ route }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets(); // For ScrollView padding
  const { onboardingData, setOnboardingData } = useContext(OnboardingContext);
  const { colors, isDark } = useTheme();
  const palette = React.useMemo(() => createPalette(colors, isDark), [colors, isDark]);
  const styles = React.useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const COLORS = palette;
  const userName = onboardingData?.name || 'User';
  const { stepsToday, distanceKm, calories: stepCalories, isPedometerAvailable, reloadStepsFromDatabase } = useTodaySteps();
  const stepGoal = onboardingData?.step_goal || 10000;

  // Algorithm integration state
  const [algorithmManager, setAlgorithmManager] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [dailyPlan, setDailyPlan] = useState(null);
  
  // Daily check-in flow state
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [hasSeenModalToday, setHasSeenModalToday] = useState(false);
  const [todaysCheckInData, setTodaysCheckInData] = useState(null);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [hasShownModalToday, setHasShownModalToday] = useState(false);
  
  // Refs to track check-in state to prevent unnecessary updates
  const hasCheckedInTodayRef = useRef(false);
  const hasSeenModalTodayRef = useRef(false);
  const hasShownModalTodayRef = useRef(false);
  const todaysCheckInDataRef = useRef(null);
  
  // Keep refs in sync with state
  useEffect(() => {
    hasCheckedInTodayRef.current = hasCheckedInToday;
    hasSeenModalTodayRef.current = hasSeenModalToday;
    hasShownModalTodayRef.current = hasShownModalToday;
    todaysCheckInDataRef.current = todaysCheckInData;
  }, [hasCheckedInToday, hasSeenModalToday, hasShownModalToday, todaysCheckInData]);
  // Initialize streak from cache if available to prevent unnecessary updates
  const [calorieStreak, setCalorieStreak] = useState(() => {
    // Initialize from cache if available and fresh
    const now = Date.now();
    if (streakCache.cachedStreak !== null && (now - streakCache.lastFetch) < streakCache.CACHE_DURATION) {
      return streakCache.cachedStreak;
    }
    return 0;
  });
  const calorieStreakRef = useRef(calorieStreak); // Track current streak value to avoid unnecessary setState calls
  
  // Keep ref in sync with state
  useEffect(() => {
    calorieStreakRef.current = calorieStreak;
  }, [calorieStreak]);

  // Handle back button - double tap to exit (ONLY on MainDashboardScreen)
  useEffect(() => {
    let backButtonPressed = 0;
    const backAction = () => {
      // Only handle back button on MainDashboardScreen
      if (navigation.getState().routes[navigation.getState().index].name === 'MainDashboard') {
        backButtonPressed++;
        if (backButtonPressed === 1) {
          // First press - do nothing, just reset after 2 seconds
          setTimeout(() => {
            backButtonPressed = 0;
          }, 2000);
          return true; // Prevent default back action
        } else if (backButtonPressed === 2) {
          // Second press within 2 seconds - exit app
          BackHandler.exitApp();
          return true;
        }
        return true;
      }
      // For other screens, allow normal navigation
      return false;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [navigation]);

  // Memoize expensive calculations (Instagram pattern)
  const percent = React.useMemo(() => 
    Math.round((stepsToday / stepGoal) * 100),
    [stepsToday, stepGoal]
  );

  // State for real food log data - Initialize with cached data if available (Instagram pattern)
  const [calories, setCalories] = useState(() => globalCache.cachedData?.calories || 0);
  const [mealsLogged, setMealsLogged] = useState(() => globalCache.cachedData?.mealsLogged || 0);
  const [lastSleepDuration, setLastSleepDuration] = useState('--');
  const [todayWorkouts, setTodayWorkouts] = useState(() => globalCache.cachedData?.todayWorkouts || 0);
  
  // Refs to track current values for comparison (prevents stale closures)
  const caloriesRef = useRef(calories);
  const mealsLoggedRef = useRef(mealsLogged);
  const todayWorkoutsRef = useRef(todayWorkouts);
  
  // Keep refs in sync with state
  useEffect(() => {
    caloriesRef.current = calories;
    mealsLoggedRef.current = mealsLogged;
    todayWorkoutsRef.current = todayWorkouts;
  }, [calories, mealsLogged, todayWorkouts]);
  
  // Sync state with cache immediately when cache updates (for optimistic updates)
  useEffect(() => {
    const updateFromCache = () => {
      if (globalCache.cachedData) {
        setMealsLogged(globalCache.cachedData.mealsLogged || 0);
        setCalories(globalCache.cachedData.calories || 0);
        setTodayWorkouts(globalCache.cachedData.todayWorkouts || 0);
      }
    };
    
    // Subscribe to cache updates
    const { subscribeToMainDashboardCache } = require('../utils/cacheManager');
    const unsubscribe = subscribeToMainDashboardCache(updateFromCache);
    
    // Initial sync
    updateFromCache();
    
    return unsubscribe;
  }, []);

  // --- Weight Journey State ---
  const [currentWeight, setCurrentWeight] = useState(null);
  const [goalWeight, setGoalWeight] = useState(null);
  const [progress, setProgress] = useState(0);
  const [goalAchieved, setGoalAchieved] = useState(false);

  const [realUserId, setRealUserId] = useState(null);
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      setRealUserId(user?.id);
    };
    getUser();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // Fetch latest sleep log
      const fetchLastSleep = async () => {
        if (!realUserId) return;
        const { data, error } = await supabase
          .from('sleep_logs')
          .select('*')
          .eq('user_id', realUserId)
          .order('date', { ascending: false })
          .limit(1);
        if (data && data[0]) {
          const log = data[0];
          // Calculate duration
          const [sh, sm] = log.start_time.split(':').map(Number);
          const [eh, em] = log.end_time.split(':').map(Number);
          let mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          setLastSleepDuration(`${Math.floor(mins / 60)}h ${mins % 60}m`);
        } else {
          setLastSleepDuration('--');
        }
      };
      fetchLastSleep();

      // --- Fetch Weight Data ---
      const fetchWeightData = async () => {
        if (!realUserId) return;
        // Fetch user profile for goal weight and goal type
        const { data: profile, error: profileError } = await supabase
          .from('user_profile')
          .select('weight, target_weight, goal_focus')
          .eq('id', realUserId)
          .single();
        
        if (profileError) {
          console.error('Error fetching profile:', profileError);
        }
        
        if (profile) {
          // Set goal weight - handle both target_weight and any variations
          const goalValue = profile.target_weight || profile.targetWeight || null;
          if (goalValue !== null && goalValue !== undefined) {
            const goalNum = Number(goalValue);
            if (!isNaN(goalNum) && goalNum > 0) {
              setGoalWeight(goalNum);
              console.log('✅ Goal weight set from profile:', goalNum, 'kg');
            } else {
              console.log('⚠️ Invalid goal weight value in profile:', goalValue);
              // Try fallback to onboardingData
              const fallbackGoal = onboardingData?.target_weight;
              if (fallbackGoal) {
                const fallbackNum = Number(fallbackGoal);
                if (!isNaN(fallbackNum) && fallbackNum > 0) {
                  setGoalWeight(fallbackNum);
                  console.log('✅ Goal weight set from onboardingData:', fallbackNum, 'kg');
                } else {
                  setGoalWeight(null);
                }
              } else {
                setGoalWeight(null);
              }
            }
          } else {
            console.log('⚠️ No target_weight found in profile, trying onboardingData...');
            // Fallback to onboardingData
            const fallbackGoal = onboardingData?.target_weight;
            if (fallbackGoal) {
              const fallbackNum = Number(fallbackGoal);
              if (!isNaN(fallbackNum) && fallbackNum > 0) {
                setGoalWeight(fallbackNum);
                console.log('✅ Goal weight set from onboardingData:', fallbackNum, 'kg');
              } else {
                console.log('⚠️ Invalid goal weight in onboardingData:', fallbackGoal);
                setGoalWeight(null);
              }
            } else {
              console.log('❌ No goal weight found in profile or onboardingData');
              setGoalWeight(null);
            }
          }
        } else {
          console.log('⚠️ No profile found, trying onboardingData...');
          // Fallback to onboardingData if profile doesn't exist
          const fallbackGoal = onboardingData?.target_weight;
          if (fallbackGoal) {
            const fallbackNum = Number(fallbackGoal);
            if (!isNaN(fallbackNum) && fallbackNum > 0) {
              setGoalWeight(fallbackNum);
              console.log('✅ Goal weight set from onboardingData:', fallbackNum, 'kg');
            } else {
              setGoalWeight(null);
            }
          } else {
            console.log('❌ No goal weight found');
            setGoalWeight(null);
          }
        }
        // Fetch all weight logs to find starting weight
        // Order by date ascending to get oldest first, then we'll find max/min
        const { data: logs, error: logsError } = await supabase
          .from('weight_logs')
          .select('weight, date')
          .eq('user_id', realUserId)
          .order('date', { ascending: true }); // Changed to ascending to process from oldest to newest
        
        if (logsError) {
          console.error('Error fetching weight logs:', logsError);
        }
        
        let latestWeight = 0;
        let startWeight = 0;
        
        // Determine goal type first (needed for start weight calculation)
        // Use goal_focus from profile, or fallback to onboardingData
        let goalType = profile?.goal_focus || onboardingData?.goal_focus || 'maintain';
        
        // Also check if current weight vs goal weight to infer goal type if goal_focus is ambiguous
        const goalNum = profile?.target_weight ? Number(profile.target_weight) : null;
        const currentWeightHint = profile?.weight ? Number(profile.weight) : null;
        
        if (typeof goalType === 'string') {
          goalType = goalType.toLowerCase();
          if (goalType.includes('lose') || goalType.includes('loss') || goalType.includes('weight loss')) {
            goalType = 'lose';
          } else if (goalType.includes('gain') || goalType.includes('muscle')) {
            goalType = 'gain';
          } else {
            // If goal_focus is ambiguous (e.g., "Stay Fit"), infer from weight relationship
            if (goalNum && currentWeightHint && !isNaN(goalNum) && !isNaN(currentWeightHint)) {
              if (currentWeightHint > goalNum) {
                goalType = 'lose'; // Current > Goal = Weight Loss
              } else if (currentWeightHint < goalNum) {
                goalType = 'gain'; // Current < Goal = Weight Gain
              } else {
                goalType = 'maintain';
              }
            } else {
              goalType = 'maintain';
            }
          }
        } else {
          // If goal_focus is not a string, infer from weight relationship
          if (goalNum && currentWeightHint && !isNaN(goalNum) && !isNaN(currentWeightHint)) {
            if (currentWeightHint > goalNum) {
              goalType = 'lose';
            } else if (currentWeightHint < goalNum) {
              goalType = 'gain';
            } else {
              goalType = 'maintain';
            }
          } else {
            goalType = 'maintain';
          }
        }
        
        try {
          // Get latest weight (most recent entry - last in array since we ordered ascending)
          if (logs && Array.isArray(logs) && logs.length > 0) {
            const latestLog = logs[logs.length - 1]; // Last log is most recent (ascending order)
            if (latestLog?.weight !== undefined && latestLog?.weight !== null) {
              const weightNum = Number(latestLog.weight);
              if (!isNaN(weightNum)) {
                latestWeight = weightNum;
              }
            }
          }
          
          // If no logs, use profile weight
          if (latestWeight === 0 && profile?.weight !== undefined && profile?.weight !== null) {
            const weightNum = Number(profile.weight);
            latestWeight = !isNaN(weightNum) ? weightNum : 0;
          }
          
          // Final validation: If we have both current and goal weights, double-check the goal type makes sense
          // This MUST happen after we've fetched latestWeight
          if (goalNum && latestWeight > 0 && !isNaN(goalNum) && !isNaN(latestWeight)) {
            if (latestWeight > goalNum && goalType === 'gain') {
              console.log('⚠️ Goal type mismatch: current (' + latestWeight + 'kg) > goal (' + goalNum + 'kg) but goalType is "gain". Changing to "lose".');
              goalType = 'lose';
            } else if (latestWeight < goalNum && goalType === 'lose') {
              console.log('⚠️ Goal type mismatch: current (' + latestWeight + 'kg) < goal (' + goalNum + 'kg) but goalType is "lose". Changing to "gain".');
              goalType = 'gain';
            }
          }
          
          // For weight loss: If startWeight will equal latestWeight (no weight lost yet),
          // and we have a goal that's lower than current, use a reasonable starting point
          // This handles the case where user set goal but hasn't logged any higher weights
          if (goalType === 'lose' && goalNum && latestWeight > goalNum && !isNaN(goalNum) && !isNaN(latestWeight)) {
            // Check if we'll end up with startWeight = latestWeight (which means 0% progress)
            // If so, and if onboarding weight is higher, use that
            // Or estimate a starting weight that makes sense (e.g., current + some buffer)
            const estimatedStartWeight = latestWeight + (latestWeight - goalNum) * 0.1; // Add 10% of the difference as buffer
            console.log('ℹ️ Weight Loss: If no higher weight found in logs, estimated start weight would be:', estimatedStartWeight.toFixed(1), 'kg');
          }
          
          // Get starting weight based on goal type
          // IMPORTANT: profile.weight gets updated every time user logs weight,
          // so we can't rely on it as the starting weight. We must use logs.
          
          // Adjust start weight based on goal type and available logs
          if (logs && Array.isArray(logs) && logs.length > 0) {
            if (goalType === 'lose') {
              // For weight loss, find the MAXIMUM weight from all logs (highest point)
              // This ensures we measure from the highest weight ever recorded
              let maxWeight = 0;
              logs.forEach(log => {
                if (log?.weight !== undefined && log?.weight !== null) {
                  const weightNum = Number(log.weight);
                  if (!isNaN(weightNum) && weightNum > 0) {
                    maxWeight = Math.max(maxWeight, weightNum);
                  }
                }
              });
              
              // Also check profile.weight as a fallback (in case it's higher than all logs)
              if (profile?.weight !== undefined && profile?.weight !== null) {
                const profileWeightNum = Number(profile.weight);
                if (!isNaN(profileWeightNum) && profileWeightNum > 0) {
                  maxWeight = Math.max(maxWeight, profileWeightNum);
                }
              }
              
              // If maxWeight is still 0 or equals latestWeight, try onboardingData weight
              // (This might be the weight when they set their goal)
              if ((maxWeight === 0 || maxWeight === latestWeight) && onboardingData?.weight) {
                const onboardingWeightNum = Number(onboardingData.weight);
                if (!isNaN(onboardingWeightNum) && onboardingWeightNum > 0 && onboardingWeightNum >= latestWeight) {
                  maxWeight = Math.max(maxWeight, onboardingWeightNum);
                  console.log('📊 Weight Loss: Using onboarding weight as start hint:', onboardingWeightNum, 'kg');
                }
              }
              
              // If still no higher weight found, and we have a goal that's lower than current,
              // estimate a reasonable starting weight (current weight + small buffer)
              // This ensures we show some progress potential even if user hasn't logged higher weights
              if (maxWeight === 0 || maxWeight === latestWeight) {
                const goalNum = profile?.target_weight ? Number(profile.target_weight) : null;
                if (goalNum && latestWeight > goalNum && !isNaN(goalNum)) {
                  // Estimate start weight as current + 10% of the difference to goal
                  // This gives a reasonable starting point for progress calculation
                  const estimatedStart = latestWeight + Math.max(1, (latestWeight - goalNum) * 0.15); // At least 1kg buffer, or 15% of difference
                  maxWeight = estimatedStart;
                  console.log('📊 Weight Loss: No higher weight found. Estimating start weight as:', estimatedStart.toFixed(1), 'kg (current:', latestWeight, 'kg, goal:', goalNum, 'kg)');
                }
              }
              
              startWeight = maxWeight > 0 ? maxWeight : latestWeight;
              console.log('📊 Weight Loss: Using maximum weight as start:', startWeight, 'kg (from', logs.length, 'logs, latest:', latestWeight, 'kg, onboarding:', onboardingData?.weight, 'kg)');
            } else if (goalType === 'gain') {
              // For weight gain, find the MINIMUM weight from all logs (lowest point)
              let minWeight = Infinity;
              logs.forEach(log => {
                if (log?.weight !== undefined && log?.weight !== null) {
                  const weightNum = Number(log.weight);
                  if (!isNaN(weightNum) && weightNum > 0) {
                    minWeight = Math.min(minWeight, weightNum);
                  }
                }
              });
              
              // Also check profile.weight as a fallback
              if (profile?.weight !== undefined && profile?.weight !== null) {
                const profileWeightNum = Number(profile.weight);
                if (!isNaN(profileWeightNum) && profileWeightNum > 0) {
                  minWeight = Math.min(minWeight, profileWeightNum);
                }
              }
              
              startWeight = minWeight !== Infinity ? minWeight : latestWeight;
              console.log('📊 Weight Gain: Using minimum weight as start:', startWeight, 'kg (from', logs.length, 'logs, latest:', latestWeight, 'kg)');
            } else {
              // For maintain, use oldest log if available
              const oldestLog = logs[0]; // First log (oldest, since we ordered ascending)
              if (oldestLog?.weight !== undefined && oldestLog?.weight !== null) {
                const oldestWeightNum = Number(oldestLog.weight);
                if (!isNaN(oldestWeightNum) && oldestWeightNum > 0) {
                  startWeight = oldestWeightNum;
                }
              } else if (profile?.weight !== undefined && profile?.weight !== null) {
                const profileWeightNum = Number(profile.weight);
                if (!isNaN(profileWeightNum) && profileWeightNum > 0) {
                  startWeight = profileWeightNum;
                }
              }
            }
          } else {
            // No logs available, use profile.weight as fallback
            if (profile?.weight !== undefined && profile?.weight !== null) {
              const profileWeightNum = Number(profile.weight);
              if (!isNaN(profileWeightNum) && profileWeightNum > 0) {
                startWeight = profileWeightNum;
              }
            }
          }
          
          // For weight loss: If startWeight equals latestWeight and current > goal,
          // it means we don't have historical data. Use current weight as start (0% progress is correct).
          // But if we have a goal and current > goal, we should at least show that they have a goal to work towards.
          if (goalType === 'lose' && startWeight < latestWeight && latestWeight > 0) {
            console.log('⚠️ Weight Loss: startWeight (' + startWeight + ') < latestWeight (' + latestWeight + '), adjusting to latestWeight');
            startWeight = latestWeight;
          }
          
          // Special case: If startWeight equals latestWeight for weight loss, and we have a goal,
          // this means the user hasn't lost any weight yet (0% progress is correct)
          if (goalType === 'lose' && startWeight === latestWeight && profile?.target_weight) {
            const goalNum = Number(profile.target_weight);
            if (!isNaN(goalNum) && goalNum > 0 && latestWeight > goalNum) {
              console.log('ℹ️ Weight Loss: startWeight equals current weight (' + startWeight + 'kg). User hasn\'t lost weight yet. Progress will be 0%.');
            }
          }
          
          // For weight gain: Ensure startWeight is <= latestWeight (can't start higher than current)
          if (goalType === 'gain' && startWeight > latestWeight && latestWeight > 0) {
            console.log('⚠️ Weight Gain: startWeight (' + startWeight + ') > latestWeight (' + latestWeight + '), adjusting to latestWeight');
            startWeight = latestWeight;
          }
          
          // Final fallback: if still no start weight, use latest weight
          if (startWeight === 0 || startWeight === null || isNaN(startWeight)) {
            console.log('⚠️ No valid start weight found, using latest weight as fallback');
            startWeight = latestWeight;
          }
        } catch (error) {
          console.error('Error parsing weight:', error);
          latestWeight = profile?.weight ? Number(profile.weight) || 0 : 0;
          startWeight = latestWeight;
        }
        
        setCurrentWeight(latestWeight > 0 ? latestWeight : null);
        
        // Calculate progress based on goal type
        try {
          if (profile && profile.target_weight && latestWeight > 0 && startWeight > 0) {
            const goalNum = Number(profile.target_weight);
            const goal = !isNaN(goalNum) && goalNum > 0 ? goalNum : null;
            
            // Goal type was already determined above
            
            if (goal && goal > 0 && startWeight > 0) {
          let prog = 0;
              let isGoalAchieved = false;
          
          console.log('Weight Progress Debug:', {
                startWeight,
            current: latestWeight,
            goal,
                goalType,
                profileWeight: profile.weight,
                totalToLose: goalType === 'lose' ? (startWeight - goal) : null,
                totalToGain: goalType === 'gain' ? (goal - startWeight) : null,
                lostSoFar: goalType === 'lose' ? (startWeight - latestWeight) : null,
                gainedSoFar: goalType === 'gain' ? (latestWeight - startWeight) : null,
              });
              
              if (goalType === 'lose') {
                // Weight Loss: Progress should show how close current weight is to goal
                // Progress increases as user gets closer to goal (remaining weight decreases)
                if (startWeight > goal && latestWeight >= goal) {
                  const remainingToLose = latestWeight - goal;
                  const totalToLoseFromStart = startWeight - goal;
                  
                  // Use a reference range that ensures progress increases as remaining decreases
                  // Formula: reference = remaining * multiplier + base
                  // This creates a scale where progress increases faster as you get closer to goal
                  // When remaining is small (close to goal), progress is high (>80%)
                  // When remaining is large (far from goal), progress is lower but still meaningful
                  const baseReference = 8; // Base reference to ensure minimum range
                  const multiplier = 2.5; // Multiplier for remaining weight (lower = higher progress when close)
                  const minReferenceRange = remainingToLose > 0 
                    ? (remainingToLose * multiplier + baseReference)
                    : totalToLoseFromStart;
                  
                  // Use the larger of: actual start-to-goal range or calculated reference
                  // This ensures we use actual progress when user has lost significant weight
                  const totalToLose = Math.max(totalToLoseFromStart, minReferenceRange);
                  
                  console.log('Weight Loss Calculation:', {
                    startWeight,
                    latestWeight,
                    goal,
                    totalToLoseFromStart,
                    remainingToLose,
                    minReferenceRange,
                    totalToLose,
                    rawProgress: 1 - (remainingToLose / totalToLose)
                  });
                  
                  // Calculate progress as: how close you are to the goal
                  // Progress = 1 - (remaining / total)
                  // With the formula above, as remaining decreases, the ratio decreases faster
                  // Example: remaining=6kg -> ref=23kg -> progress = 1 - (6/23) = 74%
                  //          remaining=3kg -> ref=15.5kg -> progress = 1 - (3/15.5) = 81%
                  // Progress increases as you get closer to goal!
                  if (totalToLose > 0) {
                    const remainingRatio = remainingToLose / totalToLose;
                    prog = Math.max(0, Math.min(1, 1 - remainingRatio));
          } else {
                    prog = 0;
                  }
                  
                  // Goal achieved when current weight <= goal weight
                  isGoalAchieved = latestWeight <= goal;
                } else if (latestWeight < goal) {
                  // Already achieved goal (current < goal)
            prog = 1;
                  isGoalAchieved = true;
                } else {
                  // If start <= goal, can't lose weight (invalid goal)
                  prog = 0;
                  isGoalAchieved = false;
                }
              } else if (goalType === 'gain') {
                // Weight Gain: Progress = (currentWeight - startWeight) / (goalWeight - startWeight)
                // Example: start=60kg, goal=70kg, current=65kg
                // Progress = (65-60) / (70-60) = 5/10 = 50%
                if (goal > startWeight) {
                  const totalToGain = goal - startWeight;
                  const gainedSoFar = latestWeight - startWeight;
                  
                  // Handle case where user lost weight (negative progress)
                  if (gainedSoFar < 0) {
                    prog = 0; // No progress if weight decreased
                  } else {
                    prog = totalToGain > 0 ? Math.max(0, Math.min(1, gainedSoFar / totalToGain)) : 0;
                  }
                  
                  // Goal achieved when current weight >= goal weight
                  isGoalAchieved = latestWeight >= goal;
                } else {
                  // If goal <= start, can't gain weight (invalid goal)
                  prog = 0;
                  isGoalAchieved = false;
                }
              } else {
                // Maintain: Show progress based on how close to goal
                // Within 1kg of goal = 100% progress
                const diff = Math.abs(latestWeight - goal);
                if (diff <= 1) {
                  prog = 1;
                  isGoalAchieved = true;
                } else {
                  // Show progress as inverse of distance from goal (max 2kg away = 0%)
                  const maxDiff = 2;
                  prog = Math.max(0, Math.min(1, 1 - (diff / maxDiff)));
                  isGoalAchieved = false;
                }
              }
              
              // Ensure prog is a valid number
              if (!isNaN(prog) && isFinite(prog)) {
                console.log('Calculated progress:', prog, 'Percentage:', Math.round(prog * 100) + '%', 'Goal Type:', goalType, 'Achieved:', isGoalAchieved);
                setProgress(prog);
          setGoalAchieved(isGoalAchieved);
        } else {
                setProgress(0);
                setGoalAchieved(false);
              }
            } else {
              setProgress(0);
              setGoalAchieved(false);
            }
          } else {
            setProgress(0);
            setGoalAchieved(false);
          }
        } catch (error) {
          console.error('Error calculating progress:', error);
          setProgress(0);
          setGoalAchieved(false);
        }
      };
      fetchWeightData();
    }, [realUserId, onboardingData?.target_weight, onboardingData?.goal_focus, onboardingData?.weight])
  );

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('user_profile')
          .select('name, weight, target_weight')
          .eq('id', session.user.id)
          .single();
        if (profile) {
          setOnboardingData((prev) => ({
            ...prev,
            name: profile.name || prev.name,
            weight: profile.weight || prev.weight,
            target_weight: profile.target_weight || prev.target_weight,
          }));
        }
      }
    };
    // Always fetch profile if name, weight, or target_weight is missing
    // This ensures we get the correct user's data after logout/login
    if (!onboardingData?.name || !onboardingData?.weight || !onboardingData?.target_weight) {
      fetchUserProfile();
    }
  }, [onboardingData?.name, onboardingData?.weight, onboardingData?.target_weight, setOnboardingData]);

  // Extract user data from onboardingData (with fallback defaults)
  const age = Number(onboardingData?.age) || 25;
  const gender = (onboardingData?.gender || 'female').toLowerCase();
  const weight_kg = Number(onboardingData?.weight) || 60;
  const height_cm = Number(onboardingData?.height) || 165;
  const activity_level = (onboardingData?.daily_activity_level || 'moderate').toLowerCase();
  let goal_type = (onboardingData?.goal_focus || 'maintain').toLowerCase();
  if (goal_type.includes('lose')) goal_type = 'lose';
  else if (goal_type.includes('gain')) goal_type = 'gain';
  else goal_type = 'maintain';

  // Calculate calorie details
  const bmr = calculateBMR(gender, weight_kg, height_cm, age);
  const tdee = calculateTDEE(bmr, activity_level);
  let calorie_goal = adjustForGoal(tdee, goal_type);
  const minCalories = getMinCalories(gender);
  if (calorie_goal < minCalories) calorie_goal = minCalories;
  calorie_goal = Math.round(calorie_goal);
  const macro_targets = getMacroTargets(calorie_goal);

  // For untracked stats, set to null or 0
  const ritualStreak = null;
  const mood = onboardingData?.mood || null;
  const calmMinutes = null;
  const calmStreak = null;
  const workouts = null;
  const workoutGoal = null;
  const sleep = null;
  const water = null;
  const waterGoal = null;
  const coins = null;
  const rewards = null;
  const ritualsDone = null;
  const ritualsTotal = null;
  const nextRitual = null;
  const quote = getTodaysQuote();

  const weight = Number(onboardingData?.weight) || 0;
  const weightGoal = Number(onboardingData?.target_weight) || 0;

  // Helper to normalize date string (handles 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM:SSZ')
  function getDateOnly(str) {
    return str ? str.slice(0, 10) : '';
  }
  // Helper to convert interval (e.g., '08:30:00') to '8h 30m'
  function parseIntervalToDisplay(interval) {
    if (!interval || typeof interval !== 'string') return '--';
    const clean = interval.trim();
    if (!clean.includes(':')) return '--';
    const [h, m, s] = clean.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '--';
    return `${h}h ${m}m`;
  }
  // Helper to convert interval to total minutes
  function parseIntervalToMinutes(interval) {
    if (!interval || typeof interval !== 'string') return 0;
    const clean = interval.trim();
    if (!clean.includes(':')) return 0;
    const [h, m, s] = clean.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  }
  // Sleep goal (hours) - will be fetched from database
  const [sleepGoal, setSleepGoal] = useState(() => globalCache.cachedData?.sleepGoal || 8);
  // Find today's sleep log for the user
  const todayStr = new Date().toISOString().slice(0,10);
  const [todaySleepLog, setTodaySleepLog] = useState(() => globalCache.cachedData?.todaySleepLog || null);
  const [sleepLogs, setSleepLogs] = useState(() => globalCache.cachedData?.sleepLogs || []);
  useFocusEffect(
    React.useCallback(() => {
        if (!realUserId) return;
      
      const now = Date.now();
      const timeSinceLastFetch = now - globalCache.lastFetchTime;
      const isStale = timeSinceLastFetch > globalCache.STALE_TIME;
      const isFresh = timeSinceLastFetch < globalCache.CACHE_DURATION;
      
      // SWR Pattern: Stale-While-Revalidate (like Instagram)
      // ALWAYS restore from cache first (even if stale) for instant UI updates
      if (globalCache.cachedData) {
        // Only update state if values actually changed (prevents unnecessary re-renders)
        // Use refs to avoid stale closures
        const cached = globalCache.cachedData;
        if ((cached.mealsLogged || 0) !== mealsLoggedRef.current) {
          mealsLoggedRef.current = cached.mealsLogged || 0;
          setMealsLogged(cached.mealsLogged || 0);
        }
        if ((cached.calories || 0) !== caloriesRef.current) {
          caloriesRef.current = cached.calories || 0;
          setCalories(cached.calories || 0);
        }
        if (JSON.stringify(cached.sleepLogs || []) !== JSON.stringify(sleepLogs)) {
          setSleepLogs(cached.sleepLogs || []);
        }
        if (JSON.stringify(cached.todaySleepLog) !== JSON.stringify(todaySleepLog)) {
          setTodaySleepLog(cached.todaySleepLog || null);
        }
        if (cached.sleepGoal && cached.sleepGoal !== sleepGoal) {
          setSleepGoal(cached.sleepGoal);
        }
        if ((cached.todayWorkouts || 0) !== todayWorkoutsRef.current) {
          todayWorkoutsRef.current = cached.todayWorkouts || 0;
          setTodayWorkouts(cached.todayWorkouts || 0);
        }
        globalCache.cacheHits++;
        
        // If data is fresh, skip fetch
        if (isFresh) {
        return; // Fresh cache - no fetch needed
      }
        // If stale but within cache duration, continue to revalidate in background
      }
      
      // Prevent concurrent fetches
      if (globalCache.isFetching) return;
      
      globalCache.isFetching = true;
      globalCache.cacheMisses++;
      
      const fetchAllData = async () => {
        try {
          const today = new Date();
          const startOfDay = new Date(today).setHours(0, 0, 0, 0);
          const endOfDay = new Date(today).setHours(23, 59, 59, 999);
          const todayStr = today.toISOString().slice(0, 10);
          
          const [foodLogs, sleepData, cardioData, routineData] = await Promise.all([
            getFoodLogs(realUserId),
            supabase.from('sleep_logs').select('*').eq('user_id', realUserId).order('date', { ascending: false }).limit(7),
            supabase.from('saved_cardio_sessions').select('id').eq('user_id', realUserId).gte('created_at', new Date(startOfDay).toISOString()).lte('created_at', new Date(endOfDay).toISOString()),
            supabase.from('workouts').select('id').eq('user_id', realUserId).gte('created_at', new Date(startOfDay).toISOString()).lte('created_at', new Date(endOfDay).toISOString())
          ]);
          
          // Process food logs
          const filteredLogs = foodLogs.filter(log => {
            const logDate = new Date(log.created_at).getTime();
            return logDate >= startOfDay && logDate <= endOfDay;
          });
          setMealsLogged(filteredLogs.length);
          setCalories(filteredLogs.reduce((sum, log) => sum + (log.calories || 0), 0));
          
          // Process sleep logs
          if (sleepData.data) {
            setSleepLogs(sleepData.data);
            const todayLog = sleepData.data.find(l => l.date?.slice(0, 10) === todayStr);
        setTodaySleepLog(todayLog || null);
            if (sleepData.data[0]?.sleep_goal) setSleepGoal(sleepData.data[0].sleep_goal);
          }
          
          // Process workouts
          const workoutsCount = (cardioData.data?.length || 0) + (routineData.data?.length || 0);
          setTodayWorkouts(workoutsCount);
          
          // Cache the data - create new object reference to trigger React updates
          globalCache.cachedData = {
            mealsLogged: filteredLogs.length,
            calories: filteredLogs.reduce((sum, log) => sum + (log.calories || 0), 0),
            sleepLogs: sleepData.data || [],
            todaySleepLog: sleepData.data?.find(l => l.date?.slice(0, 10) === todayStr) || null,
            sleepGoal: sleepData.data?.[0]?.sleep_goal || 8,
            todayWorkouts: workoutsCount,
          };
          
          // Update cache timestamp
          globalCache.lastFetchTime = Date.now();
          
          // Notify listeners of cache update
          if (globalCache._listeners) {
            globalCache._listeners.forEach(listener => listener());
          }
        } catch (error) {
          // Silent error handling
        } finally {
          globalCache.isFetching = false;
        }
      };
      
      fetchAllData();
    }, [realUserId])
  );
  let todaySleepDuration = '--';
  let todaySleepPercent = 0;
  if (todaySleepLog && todaySleepLog.duration) {
    todaySleepDuration = parseIntervalToDisplay(todaySleepLog.duration);
    const mins = parseIntervalToMinutes(todaySleepLog.duration);
    todaySleepPercent = sleepGoal > 0 ? Math.min(100, Math.round((mins / (sleepGoal * 60)) * 100)) : 0;
  }

  // Initialize hydration state with cached data (Instagram pattern)
  const [currentIntake, setCurrentIntake] = useState(() => globalCache.cachedHydrationData?.currentIntake || 0);
  const [dailyGoal, setDailyGoal] = useState(() => globalCache.cachedHydrationData?.dailyGoal || 2.5);
  const [intake1, setIntake1] = useState(() => globalCache.cachedHydrationData?.intake1 || 250);
  const [intake2, setIntake2] = useState(() => globalCache.cachedHydrationData?.intake2 || 500);
  const [hydrationLoading, setHydrationLoading] = useState(() => !globalCache.cachedHydrationData);
  const [hydrationRecordId, setHydrationRecordId] = useState(() => globalCache.cachedHydrationData?.hydrationRecordId || null);

  useFocusEffect(
    React.useCallback(() => {
      if (!realUserId) return;
      
      // Check cache - skip fetch if data is fresh
      const now = Date.now();
      if (now - globalCache.lastHydrationFetch < globalCache.CACHE_DURATION && globalCache.cachedHydrationData) {
        // Restore hydration state from cache
        setCurrentIntake(globalCache.cachedHydrationData.currentIntake);
        setDailyGoal(globalCache.cachedHydrationData.dailyGoal);
        setIntake1(globalCache.cachedHydrationData.intake1);
        setIntake2(globalCache.cachedHydrationData.intake2);
        setHydrationRecordId(globalCache.cachedHydrationData.hydrationRecordId);
        setHydrationLoading(false);
        return; // Use cached data
      }
      
    const fetchHydration = async () => {
      const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
        .from('daily_water_intake')
        .select('*')
          .eq('user_id', realUserId)
        .eq('date', today)
        .single();
        
      if (data) {
        setCurrentIntake(data.current_intake_ml / 1000);
        setDailyGoal(data.daily_goal_ml / 1000);
        setIntake1(data.intake1_ml || 250);
        setIntake2(data.intake2_ml || 500);
          setHydrationRecordId(data.id);
        } else {
          await createTodayHydrationRecord(realUserId, today);
          setCurrentIntake(0);
          setDailyGoal(2.5);
          setIntake1(250);
          setIntake2(500);
      }
      setHydrationLoading(false);
        
        // Cache hydration data
        globalCache.cachedHydrationData = {
          currentIntake: data ? data.current_intake_ml / 1000 : 0,
          dailyGoal: data ? data.daily_goal_ml / 1000 : 2.5,
          intake1: data?.intake1_ml || 250,
          intake2: data?.intake2_ml || 500,
          hydrationRecordId: data?.id || null,
        };
        
        // Update cache timestamp
        globalCache.lastHydrationFetch = Date.now();
    };
    fetchHydration();
    }, [realUserId])
  );

  // Initialize algorithm manager
  useEffect(() => {
    if (realUserId && onboardingData) {
      // Algorithm manager initialization removed
    }
  }, [realUserId, onboardingData]);

  // Subscribe to streak updates when food is logged (via cache manager)
  useEffect(() => {
    if (!realUserId) return;
    
    const updateStreakFromCache = () => {
      // Force refetch streak immediately when food is logged
      streakCache.lastFetch = 0;
      // Fetch fresh streak immediately
      getFoodStreak(realUserId).then(currentStreak => {
        streakCache.cachedStreak = currentStreak;
        streakCache.lastFetch = Date.now();
        setCalorieStreak(prevStreak => {
          if (prevStreak !== currentStreak) {
            calorieStreakRef.current = currentStreak;
            return currentStreak;
          }
          return prevStreak;
        });
      }).catch(error => {
        console.error('Error fetching streak:', error);
      });
    };
    
    // Subscribe to streak updates from cache manager
    if (!globalCache._streakListeners) {
      globalCache._streakListeners = new Set();
    }
    globalCache._streakListeners.add(updateStreakFromCache);
    
    return () => {
      if (globalCache._streakListeners) {
        globalCache._streakListeners.delete(updateStreakFromCache);
      }
    };
  }, [realUserId]);

  // Daily check-in flow management - check every time screen focuses
  useFocusEffect(
    React.useCallback(() => {
      checkDailyCheckInStatus();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Separate useFocusEffect for streak loading to prevent re-renders from check-in status
  useFocusEffect(
    React.useCallback(() => {
      if (!realUserId) return;
      
      // Check cache first - if fresh and value hasn't changed, skip entirely (like ExerciseScreen)
      const now = Date.now();
      const timeSinceLastFetch = now - streakCache.lastFetch;
      const cacheExpired = !streakCache.cachedStreak || 
                          (timeSinceLastFetch >= streakCache.CACHE_DURATION);
      
      if (!cacheExpired) {
        // Cache is fresh - only update if value changed (like ExerciseScreen pattern)
        const cachedValue = streakCache.cachedStreak;
        if (cachedValue !== calorieStreakRef.current) {
          calorieStreakRef.current = cachedValue;
          setCalorieStreak(cachedValue);
        }
        // Don't fetch if cache is fresh
        return;
      }
      
      // Cache expired - fetch fresh streak
      const loadStreak = async () => {
        try {
          const currentStreak = await getFoodStreak(realUserId);
          streakCache.cachedStreak = currentStreak;
          streakCache.lastFetch = now;
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Reload steps data when screen focuses (to pick up deletions from StepTrackerScreen)
  useFocusEffect(
    React.useCallback(() => {
      if (reloadStepsFromDatabase) {
        reloadStepsFromDatabase();
      }
    }, [reloadStepsFromDatabase])
  );

  // Reset daily state when date changes
  useEffect(() => {
    const checkForNewDay = async () => {
      const today = new Date().toDateString();
      const lastCheckDate = await AsyncStorage.getItem('lastCheckDate');
      
      if (lastCheckDate !== today) {
        // New day - reset all daily states
        setHasCheckedInToday(false);
        setHasSeenModalToday(false);
        setHasShownModalToday(false);
        setTodaysCheckInData(null);
        await AsyncStorage.setItem('lastCheckDate', today);
      }
    };
    
    checkForNewDay();
  }, []);

  const checkDailyCheckInStatus = async () => {
    try {
      const today = new Date().toDateString();
      const checkInData = await AsyncStorage.getItem(`dailyCheckIn_${today}`);
      const seenModalData = await AsyncStorage.getItem(`seenModal_${today}`);
      const shownModalData = await AsyncStorage.getItem(`shownModal_${today}`);
      
      // Only update state if values actually changed (prevents unnecessary re-renders)
      // Use refs to avoid stale closures
      if (checkInData) {
        const parsedData = JSON.parse(checkInData);
        if (!hasCheckedInTodayRef.current || JSON.stringify(todaysCheckInDataRef.current) !== JSON.stringify(parsedData)) {
          hasCheckedInTodayRef.current = true;
          todaysCheckInDataRef.current = parsedData;
        setHasCheckedInToday(true);
        setTodaysCheckInData(parsedData);
        }
      }
      
      if (seenModalData && !hasSeenModalTodayRef.current) {
        hasSeenModalTodayRef.current = true;
        setHasSeenModalToday(true);
      }
      
      if (shownModalData && !hasShownModalTodayRef.current) {
        hasShownModalTodayRef.current = true;
        setHasShownModalToday(true);
      }
      
      // Auto-open modal only if user hasn't checked in AND hasn't seen modal today AND hasn't shown modal today
      if (!checkInData && !seenModalData && !shownModalData) {
        if (!showCheckIn) {
        setShowCheckIn(true);
        }
        if (!hasShownModalTodayRef.current) {
          hasShownModalTodayRef.current = true;
        setHasShownModalToday(true);
        // Persist that we've shown the modal today
        await AsyncStorage.setItem(`shownModal_${today}`, 'true');
        }
      }
    } catch (error) {
      console.error('Error checking daily check-in status:', error);
    }
  };

  const saveCheckInData = async (data) => {
    try {
      const today = new Date().toDateString();
      await AsyncStorage.setItem(`dailyCheckIn_${today}`, JSON.stringify(data));
      setHasCheckedInToday(true);
      setTodaysCheckInData(data);
    } catch (error) {
      console.error('Error saving check-in data:', error);
    }
  };

  const markModalAsSeen = async () => {
    try {
      const today = new Date().toDateString();
      await AsyncStorage.setItem(`seenModal_${today}`, 'true');
      setHasSeenModalToday(true);
    } catch (error) {
      console.error('Error marking modal as seen:', error);
    }
  };

  const handleCheckInClose = async () => {
    setShowCheckIn(false);
    setHasShownModalToday(true);
    // Persist that we've shown the modal today
    const today = new Date().toDateString();
    await AsyncStorage.setItem(`shownModal_${today}`, 'true');
    markModalAsSeen();
  };

  const handleCheckInButtonPress = () => {
    if (hasCheckedInToday) {
      // Show goals modal
      setShowGoalsModal(true);
    } else {
      // Open check-in modal
      setShowCheckIn(true);
    }
  };

  // Daily routine handler
  const startDailyRoutine = async (manager) => {
    try {
      const result = await manager.startDailyRoutine();
      
      if (result.type === 'recovery') {
        Alert.alert(
          'Recovered Data',
          `Found ${result.data.length} unsaved entries. Would you like to restore them?`,
          [
            { text: 'Discard', style: 'cancel' },
            { text: 'Restore', onPress: () => restoreRecoveredData(result.data) }
          ]
        );
      } else if (result.type === 'checkin') {
        // Only show check-in modal if we haven't already shown it today
        const today = new Date().toDateString();
        const shownModalData = await AsyncStorage.getItem(`shownModal_${today}`);
        const checkInData = await AsyncStorage.getItem(`dailyCheckIn_${today}`);
        
        if (!shownModalData && !checkInData) {
          setShowCheckIn(true);
        }
      }
    } catch (error) {
      console.error('Error starting daily routine:', error);
    }
  };

  const restoreRecoveredData = async (data) => {
    for (const item of data) {
      console.log(`Restoring ${item.key} from ${item.ageMinutes} minutes ago`);
    }
  };

  const handleCheckInComplete = async (responses) => {
    try {
      console.log('Received responses from DailyCheckInModal:', responses);
      
      // Ensure situation is properly formatted as an array
      const processedResponses = {
        ...responses,
        situation: Array.isArray(responses.situation) 
          ? responses.situation 
          : responses.situation 
            ? [responses.situation] 
            : ['Normal day']
      };
      
      console.log('Processing responses:', processedResponses);
      
      const result = await algorithmManager.processDailyCheckIn(processedResponses);
      
      console.log('Check-in result:', result);
      
      if (result.success && result.dailyGoal) {
        setDailyPlan(result.dailyPlan);
        
        // Save check-in data
        const checkInData = {
          responses: processedResponses,
          dailyGoal: result.dailyGoal,
          dailyPlan: result.dailyPlan,
          timestamp: new Date().toISOString()
        };
        await saveCheckInData(checkInData);
        setHasShownModalToday(true);
        // Persist that we've shown the modal today
        const today = new Date().toDateString();
        await AsyncStorage.setItem(`shownModal_${today}`, 'true');
        
        Alert.alert(
          'Your Personalized Plan',
          `Today's goal: ${result.dailyGoal.min}-${result.dailyGoal.max} calories\n\n${result.dailyGoal.displayMessage}`,
          [{ text: 'Got it!', style: 'default' }]
        );
      } else {
        console.error('Check-in failed or missing dailyGoal:', result);
        Alert.alert('Error', 'Failed to generate personalized plan. Please try again.');
      }
    } catch (error) {
      console.error('Error processing check-in:', error);
      Alert.alert('Error', 'Failed to process check-in. Please try again.');
    }
  };

  // Create today's hydration record if it doesn't exist
  const createTodayHydrationRecord = async (userId, today) => {
    try {
      const { data, error } = await supabase
        .from('daily_water_intake')
        .insert({
          user_id: userId,
          date: today,
          current_intake_ml: 0,
          daily_goal_ml: 2500,
          intake1_ml: 250,
          intake2_ml: 500,
          goal_status: 'not achieved',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      setHydrationRecordId(data.id);
    } catch (error) {
      // Silent
    }
  };

  const handleAddWater = async (amount) => {
    if (!hydrationRecordId) return;

    // Convert amount from ml to L (same as HydrationTrackerScreen)
    const amountInL = amount / 1000;
    const newIntake = Math.min(currentIntake + amountInL, dailyGoal);
    
    // Optimistic update - update UI immediately
    setCurrentIntake(newIntake);
    
    // Update cache immediately for instant display on navigation
    if (globalCache.cachedHydrationData) {
      globalCache.cachedHydrationData.currentIntake = newIntake;
      globalCache.lastHydrationFetch = Date.now();
    }
    
    try {
      // Update by record ID (same as HydrationTrackerScreen)
      const { error } = await supabase
      .from('daily_water_intake')
        .update({
          current_intake_ml: Math.round(newIntake * 1000), // Convert L to ml for database
          goal_status: newIntake >= dailyGoal ? 'achieved' : 'not achieved',
          updated_at: new Date().toISOString()
        })
        .eq('id', hydrationRecordId);

      if (error) throw error;
    } catch (error) {
      // Silent - but could rollback optimistic update here if needed
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Daily Check-in Modal */}
      <DailyCheckInModal
        visible={showCheckIn}
        onClose={handleCheckInClose}
        onComplete={handleCheckInComplete}
        userProfile={onboardingData}
      />
      
      {/* Goals Modal */}
      <Modal
        visible={showGoalsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGoalsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.goalsModalContainer}>
            <View style={styles.goalsModalHeader}>
              <Text style={styles.goalsModalTitle}>Today&apos;s Personalized Plan</Text>
              <TouchableOpacity
                style={styles.goalsModalCloseButton}
                onPress={() => setShowGoalsModal(false)}
              >
              <Ionicons name="close" size={24} color={COLORS.neutralSecondary} />
              </TouchableOpacity>
            </View>
            
            {todaysCheckInData && (
              <ScrollView style={styles.goalsModalContent}>
                {/* Calorie Goals */}
                <View style={styles.goalSection}>
                  <Text style={styles.goalSectionTitle}>🎯 Calorie Goals</Text>
                  <View style={styles.calorieGoalCard}>
                    <Text style={styles.calorieGoalRange}>
                      {todaysCheckInData.dailyGoal.min} - {todaysCheckInData.dailyGoal.max} calories
                    </Text>
                    <Text style={styles.calorieGoalTarget}>
                      Target: {todaysCheckInData.dailyGoal.target} calories
                    </Text>
                    <Text style={styles.calorieGoalMessage}>
                      {todaysCheckInData.dailyGoal.displayMessage}
                    </Text>
                  </View>
                </View>
                
                {/* Check-in Responses */}
                <View style={styles.goalSection}>
                  <Text style={styles.goalSectionTitle}>📊 Your Check-in</Text>
                  <View style={styles.checkInSummaryCard}>
                    <Text style={styles.checkInSummaryText}>
                      Sleep: {todaysCheckInData.responses.sleep} hours
                    </Text>
                    <Text style={styles.checkInSummaryText}>
                      Energy: {todaysCheckInData.responses.energy}
                    </Text>
                    <Text style={styles.checkInSummaryText}>
                      Stress: {todaysCheckInData.responses.stress}
                    </Text>
                    <Text style={styles.checkInSummaryText}>
                      Mood: {todaysCheckInData.responses.mood}/10
                    </Text>
                    {todaysCheckInData.responses.situation && todaysCheckInData.responses.situation.length > 0 && (
                      <Text style={styles.checkInSummaryText}>
                        Situation: {todaysCheckInData.responses.situation.join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
                
                {/* Reasons */}
                {todaysCheckInData.dailyGoal.reasons && todaysCheckInData.dailyGoal.reasons.length > 0 && (
                  <View style={styles.goalSection}>
                    <Text style={styles.goalSectionTitle}>💡 Insights</Text>
                    {todaysCheckInData.dailyGoal.reasons.map((reason, index) => (
                      <View key={index} style={styles.insightCard}>
                        <Text style={styles.insightText}>
                          {reason.factor}: {reason.message}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
            
            <TouchableOpacity
              style={styles.goalsModalButton}
              onPress={() => setShowGoalsModal(false)}
            >
              <Text style={styles.goalsModalButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
          paddingBottom: Math.max(110, (insets.bottom >= 20 ? insets.bottom + 16 : 16) + 80), // ensure content is visible above footer
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting Card */}
        <View style={styles.greetingCard}>
          <Text style={styles.greetingCardTitle}>Good Morning, {userName}</Text>          
          {/* Daily Check-in Button and Streak */}
          <View style={styles.checkInRow}>
          <TouchableOpacity
            style={styles.checkInButton}
            onPress={handleCheckInButtonPress}
          >
              <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
            <Text style={styles.checkInButtonText}>
              {hasCheckedInToday ? 'View Check-in' : 'Daily Check-in'}
            </Text>
          </TouchableOpacity>
            <StreakBadge calorieStreak={calorieStreak} />
          </View>
          {ritualStreak !== null ? (
            <View style={styles.streakRowBlue}>
              <Ionicons name="water" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
              <Text style={styles.greetingCardStreak}>{ritualStreak}-day consistency streak</Text>
            </View>
          ) : null}
        </View>

        {/* Mood/Journal Card */}
        <TouchableOpacity 
          style={styles.moodCard} 
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Journal')}
        >
          <View style={styles.moodIconWrap}><MaterialCommunityIcons name="emoticon-happy-outline" size={28} color={COLORS.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.moodTitle}>{mood || 'Time Line'}</Text>
            <Text style={styles.moodSub}>Keep track of your Journey</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        {/* --- Dashboard Cards Start Here --- */}
        <View style={styles.dashboardContainer}>
          {/* Stats Row */}
          <View style={styles.statRowBg}>
            <View style={styles.statRowCustom}>
              {/* Calories Today Card */}
              <TouchableOpacity
                style={styles.statCardCustom}
                onPress={() => navigation.navigate('Home')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <View style={styles.fireIconContainer}>
                    <MaterialCommunityIcons name="fire" size={28} color={COLORS.accentOrange} />
                  </View>
                  <Text style={styles.statLabelCustom}>Calories{`\n`}Today</Text>
                </View>
                <Text style={styles.statValueCustom2}>{calories} / {calorie_goal}</Text>
                <Text style={styles.statSubCustom}>{mealsLogged} meals logged</Text>
              </TouchableOpacity>
              {/* Strength Today Card */}
              <TouchableOpacity
                style={styles.statCardCustom}
                onPress={() => navigation.navigate('Exercise')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="dumbbell" size={20} color={COLORS.accentBlue} style={{ marginRight: 8 }} />
                  <Text style={styles.statLabelCustom}>Strength{`\n`}Today</Text>
                </View>
                <Text style={[styles.statValueCustom, { textAlign: 'left' }]}> {`\t`} {todayWorkouts}</Text>
                <Text style={styles.statSubCustom}>workouts this Day</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hydration Card */}
          <View style={styles.shadowWrapper}>
            <TouchableOpacity 
              style={styles.hydrationCardCustom}
              onPress={() => navigation.navigate('HydrationTrackerScreen')}
              activeOpacity={0.8}
            >
              <View style={styles.hydrationCardContent}>
                {/* Left Section - Progress Indicator */}
                <View style={styles.hydrationProgressContainer}>
                  <View style={styles.hydrationBottleContainer}>
                    {/* Progress Fill */}
                    <View style={[
                      styles.hydrationBottleFill, 
                      { 
                        height: hydrationLoading ? '0%' : currentIntake === 0 ? '0%' : `${Math.min(100, (currentIntake / dailyGoal) * 100)}%`,
                        minHeight: currentIntake === 0 ? 0 : 20
                      }
                    ]}>
                    </View>
                    {/* Icon and Percentage - Always centered */}
                    <View style={styles.hydrationIconPercentageContainer}>
                      <MaterialCommunityIcons 
                        name="water-outline" 
                        size={28} 
                        color={COLORS.text} 
                        style={styles.hydrationDropIcon} 
                      />
                      <Text style={[
                        styles.hydrationPercentage,
                        { 
                          textShadowColor: "#000",
                          textShadowOffset: { width: 0.5, height: 0.5 },
                          textShadowRadius: 1,
                        }
                      ]}>
                        {hydrationLoading ? '0%' : `${Math.min(100, Math.round((currentIntake / dailyGoal) * 100))}%`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Right Section - Details and Actions */}
                <View style={styles.hydrationDetailsSection}>
                  <Text style={styles.hydrationTitle}>Hydration</Text>
                  <View style={styles.hydrationProgressText}>
                    <Text style={styles.hydrationGoal}>
                      {hydrationLoading ? '--' : `${currentIntake.toFixed(1)}L / ${dailyGoal.toFixed(1)}L`}
                    </Text>
                  </View>
                  <View style={styles.hydrationBtnsRow}>
                    <TouchableOpacity 
                      style={styles.hydrationBtn} 
                      onPress={(e) => {
                        e.stopPropagation();
                        handleAddWater(250);
                      }}
                    >
                      <Text style={styles.hydrationBtnText}>+250ml</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.hydrationBtn} 
                      onPress={(e) => {
                        e.stopPropagation();
                        handleAddWater(500);
                      }}
                    >
                      <Text style={styles.hydrationBtnText}>+500ml</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Sleep & Steps Row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }}>
            {/* Steps Card */}
            <View style={{ flex: 1, marginRight: 8 }}>
              <TouchableOpacity
                style={styles.stepsHighlightCard}
                onPress={() => navigation.navigate('StepTrackerScreen')}
                activeOpacity={0.85}
              >
                {/* Icon and expand */}
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.stepsHighlightIcon}>
                      <MaterialCommunityIcons name="walk" size={22} color={COLORS.stepsIcon} />
                    </View>
                    <Text style={styles.stepsHighlightTitle}>
                      Walk Steps
                    </Text>
                  </View>
                </View>
                <View style={styles.stepsHighlightBadgeRow}>
                  <View style={styles.stepsHighlightBadge}>
                    <Text style={styles.stepsHighlightBadgeText}>{percent}% Goal</Text>
                  </View>
                </View>
                <Text style={styles.stepsHighlightValue}>{stepsToday.toLocaleString()}</Text>
                {/* {isPedometerAvailable !== 'true' && (
                  <Text style={{ fontFamily: 'Manrope-Regular', fontSize: 14, color: '#e74c3c', marginTop: 2 }}>
                    Step sensor not available on this device.
                  </Text>
                )} */}
              </TouchableOpacity>
            </View>
            {/* Sleep Card */}
            <View style={{ flex: 1, marginLeft: 8 }}>
              <TouchableOpacity
                style={styles.sleepHighlightCard}
                onPress={() => navigation.navigate('SleepTrackerScreen')}
                activeOpacity={0.85}
              >
                {/* Icon and expand */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.sleepHighlightIcon}>
                      <MaterialCommunityIcons name="moon-waning-crescent" size={22} color={COLORS.sleepAccent} />
                    </View>
                    <Text style={styles.sleepHighlightTitle}>
                      Sleep
                    </Text>
                  </View>
                </View>
                <View style={styles.sleepHighlightBadgeRow}>
                  <View style={styles.sleepHighlightBadge}>
                    <Text style={styles.sleepHighlightBadgeText}>{todaySleepPercent}% of {sleepGoal}h</Text>
                  </View>
                </View>
                <Text style={styles.sleepHighlightValue}>{todaySleepDuration}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weight Journey Card */}
          <View style={styles.weightJourneyCardV2}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="scale-bathroom" size={26} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={styles.weightJourneyLabelV2}>Weight Journey</Text>
              <Ionicons name="camera-outline" size={22} color={COLORS.neutralIcon} style={{ marginLeft: 'auto' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.weightJourneySubV2}>Current</Text>
                <Text style={styles.weightJourneyCurrentV2}>{currentWeight ? `${currentWeight} kg` : '--'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.weightJourneySubV2}>Goal</Text>
                <Text style={styles.weightJourneyGoalV2}>{goalWeight ? `${goalWeight} kg` : '--'}</Text>
              </View>
            </View>
            <View style={styles.weightJourneyBarBgV2}>
              <View style={[
                styles.weightJourneyBarFillV2, 
                { 
                  width: (() => {
                    const progressValue = progress !== undefined && !isNaN(progress) && isFinite(progress) ? progress : 0;
                    const percentage = Math.max(0, Math.min(100, Math.round(progressValue * 100)));
                    return `${Math.max(2, percentage)}%`; // Minimum 2% to show bar, max 100%
                  })()
                }
              ]} />
            </View>
            {goalAchieved ? (
              <View style={styles.congratulationsContainer}>
                <Text style={styles.congratulationsText}>🎉 Congratulations! Goal Achieved! 🎉</Text>
                <Text style={styles.progressText}>
                  You&apos;ve reached your target weight of {goalWeight || '--'} kg!
                </Text>
              </View>
            ) : (
              <Text style={styles.progressText}>
                {(() => {
                  const progressValue = progress !== undefined && !isNaN(progress) && isFinite(progress) ? progress : 0;
                  const percentage = Math.max(0, Math.min(100, Math.round(progressValue * 100)));
                  return `${percentage}%`;
                })()} towards goal
              </Text>
            )}
            <TouchableOpacity style={styles.weightJourneyBtnV2} onPress={() => navigation.navigate('WeightTrackerScreen')}>
              <Text style={styles.weightJourneyBtnTextV2}>View Progress</Text>
            </TouchableOpacity>
          </View>



        </View>

      </ScrollView>
      <FooterBar navigation={navigation} activeTab="Home" />
    </SafeAreaView>
  );
};

const createStyles = (COLORS, isDark) => {
  const SHADOW = createShadowStyles(COLORS, isDark);
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: { paddingBottom: 32, backgroundColor: COLORS.background },
  greetingCard: {
    backgroundColor: COLORS.greetingCardBg,
    borderRadius: 18,
    marginHorizontal: 18,
    marginTop: 24,
    marginBottom: 18,
    padding: 20,
    ...SHADOW.md,
    position: 'relative',
  },
  logoutBtnAbsolute: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    padding: 4,
  },
  streakRowBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  greetingCardTitle: {
    fontSize: 22,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginBottom: 2,
    textAlign: 'left',
  },
  greetingCardVibe: {
    fontSize: 15,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
    marginBottom: 2,
    textAlign: 'left',
  },
  checkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignSelf: 'flex-start',
  },
  checkInButtonText: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: COLORS.primary,
    marginLeft: 6,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.streakBg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  streakEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  streakText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 12,
    color: COLORS.text,
  },
  greetingCardStreak: {
    color: COLORS.accentBlue,
    fontFamily: 'Manrope-Bold',
    fontSize: 15,
    textAlign: 'left',
  },
  moodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 18, marginHorizontal: 20, marginBottom: 12, ...SHADOW.md },
  moodIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  moodTitle: { fontSize: 17, fontFamily: 'Lexend-Bold', color: COLORS.primary, marginBottom: 2 },
  moodSub: { fontSize: 14, fontFamily: 'Manrope-Regular', color: COLORS.secondary },
  statsGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  statCard2x2: {
    flexBasis: '48%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  statIcon2x2: { marginBottom: 6 },
  statLabel2x2: { fontSize: 13, fontFamily: 'Manrope-Bold', color: COLORS.secondary, marginBottom: 2 },
  statMain2x2: { fontSize: 16, fontFamily: 'Lexend-Bold', color: COLORS.primary, marginBottom: 2 },
  statSub2x2: { fontSize: 13, fontFamily: 'Manrope-Regular', color: COLORS.secondary },
  waterCardFull: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  waterLabelFull: { fontSize: 13, fontFamily: 'Manrope-Bold', color: COLORS.secondary, marginRight: 10 },
  waterTextFull: { fontSize: 15, fontFamily: 'Lexend-Bold', color: COLORS.water, flex: 1 },
  addWaterBtnFull: { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 8 },
  addWaterText: { color: COLORS.primary, fontFamily: 'Manrope-Bold', fontSize: 14 },
  waterBarBgFull: { height: 8, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.full, marginTop: 2, width: '100%' },
  waterBarFillFull: { height: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  statsGrid2x1: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 12 },
  statCard2x1: { flexBasis: '48%', backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, alignItems: 'flex-start', borderWidth: 1, borderColor: COLORS.primaryLight },
  statIcon2x1: { marginBottom: 6 },
  statLabel2x1: { fontSize: 13, fontFamily: 'Manrope-Bold', color: COLORS.secondary, marginBottom: 2 },
  statMain2x1: { fontSize: 16, fontFamily: 'Lexend-Bold', color: COLORS.primary, marginBottom: 2 },
  statSub2x1: { fontSize: 13, fontFamily: 'Manrope-Regular', color: COLORS.secondary },
  ritualsCardFull: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, marginHorizontal: 20, marginBottom: 12, padding: 16, borderWidth: 1, borderColor: COLORS.primaryLight },
  ritualsTitleFull: { fontSize: 15, fontFamily: 'Lexend-Bold', color: COLORS.rituals, flex: 1 },
  ritualsDoneFull: { fontSize: 15, fontFamily: 'Manrope-Bold', color: COLORS.rituals, marginLeft: 8 },
  ritualsBarBgFull: { height: 8, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.full, marginTop: 2, width: '100%' },
  ritualsBarFillFull: { height: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  ritualsNextFull: { fontSize: 13, color: COLORS.secondary, fontFamily: 'Manrope-Regular', marginTop: 6 },
  quoteCardFull: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, marginHorizontal: 20, marginBottom: 24, padding: 16, borderWidth: 1, borderColor: COLORS.primaryLight },
  quoteLabelFull: { fontSize: 15, fontFamily: 'Lexend-Bold', color: COLORS.primary, marginBottom: 6 },
  quoteTextFull: { fontSize: 15, fontFamily: 'Manrope-Bold', color: COLORS.primary, marginBottom: 10 },
  quoteInputFull: { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: 12, fontSize: 15, fontFamily: 'Manrope-Regular', color: COLORS.text, marginTop: 2 },
  statIconLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statLabelBig: { fontSize: 16, fontFamily: 'Lexend-Bold', color: COLORS.primary, marginLeft: 8 },
  waterLabelBig: { fontSize: 16, fontFamily: 'Lexend-Bold', color: COLORS.water, marginRight: 10 },
  waterPrompt: { fontSize: 13, fontFamily: 'Manrope-Regular', color: COLORS.secondary, marginTop: 4, marginLeft: 2 },
  // New styles for dashboard layout
  dashboardContainer: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    flexBasis: '48%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  statIcon: { marginBottom: 8 },
  statLabel: {
    fontSize: 14,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginTop: 4,
    textAlign: 'center',
  },
  statSub: {
    fontSize: 12,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  hydrationCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  hydrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  hydrationTitle: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  hydrationGoal: {
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    color: COLORS.text,
    marginRight: 8,
  },
  hydrationEmojis: {
    fontSize: 16,
  },
  hydrationBtnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  hydrationBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  hydrationBtnText: {
    color: COLORS.text,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
    fontWeight: '600',
  },
  sleepCard: {
    flexBasis: '48%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  sleepTitle: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
    color: COLORS.primary,
    marginTop: 8,
  },
  sleepValue: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginTop: 4,
  },
  sleepSub: {
    fontSize: 12,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
    marginTop: 4,
  },
  sleepBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginTop: 12,
  },
  sleepBtnText: {
    color: COLORS.primary,
    fontFamily: 'Manrope-Bold',
    fontSize: 14,
  },
  stepsCard: {
    flexBasis: '48%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  stepsTitle: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
    color: COLORS.primary,
    marginTop: 8,
  },
  stepsValue: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginTop: 4,
  },
  stepsHighlightCard: {
    backgroundColor: COLORS.stepsCardBg,
    borderRadius: 24,
    padding: 20,
    minWidth: 0,
    alignItems: 'flex-start',
    shadowColor: isDark ? '#000' : '#000',
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  stepsHighlightIcon: {
    backgroundColor: COLORS.stepsBadgeBg,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsHighlightTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: 18,
    color: COLORS.text,
    marginLeft: 10,
  },
  stepsHighlightBadgeRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 8,
  },
  stepsHighlightBadge: {
    borderWidth: 1,
    borderColor: COLORS.stepsIcon,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  stepsHighlightBadgeText: {
    fontFamily: 'Lexend-Regular',
    fontSize: 12,
    color: COLORS.stepsIcon,
  },
  stepsHighlightValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: 28,
    color: COLORS.text,
    marginTop: 2,
  },
  sleepHighlightCard: {
    backgroundColor: COLORS.sleepCardBg,
    borderRadius: 24,
    padding: 20,
    minWidth: 0,
    alignItems: 'flex-start',
    shadowColor: isDark ? '#000' : '#000',
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  sleepHighlightIcon: {
    backgroundColor: isDark ? 'rgba(124, 58, 237, 0.25)' : '#F3E8FF',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepHighlightTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: 18,
    color: COLORS.sleepAccent,
    marginLeft: 10,
  },
  sleepHighlightBadgeRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 8,
  },
  sleepHighlightBadge: {
    borderWidth: 1,
    borderColor: COLORS.sleepAccent,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  sleepHighlightBadgeText: {
    fontFamily: 'Lexend-Regular',
    fontSize: 12,
    color: COLORS.sleepAccent,
  },
  sleepHighlightValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: 28,
    color: COLORS.text,
    marginTop: 2,
  },
  weightJourneyCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  weightJourneyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  weightJourneyTitle: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
    color: COLORS.primary,
    marginLeft: 8,
  },
  weightJourneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weightJourneyCurrentLabel: {
    fontSize: 12,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
  },
  weightJourneyCurrentValue: {
    fontSize: 16,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
  },
  weightJourneyGoalLabel: {
    fontSize: 12,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
  },
  weightJourneyGoalValue: {
    fontSize: 16,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
  },
  weightJourneyBarBg: {
    height: 8,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    marginTop: 8,
    marginBottom: 12,
  },
  weightJourneyBarFill: {
    height: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  weightJourneyBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  weightJourneyBtnText: {
    color: COLORS.primary,
    fontFamily: 'Manrope-Bold',
    fontSize: 14,
  },
  habitsCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  habitsTitle: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  habitText: {
    fontSize: 14,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
    marginLeft: 8,
  },
  habitCheck: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: 'auto',
  },
  habitCheckFilled: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    marginLeft: 'auto',
  },
  recentMealsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentMealsLabel: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
  },
  recentMealsAddBtn: {
    padding: 8,
  },
  recentMealsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mealCard: {
    flexBasis: '30%',
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  mealImg: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    marginBottom: 8,
  },
  mealTitle: {
    fontSize: 13,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  mealKcal: {
    fontSize: 12,
    fontFamily: 'Manrope-Bold',
    color: COLORS.text,
  },
  statRowCustom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 0,
    marginBottom: 18,
  },
  statCardCustom: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 21,
    marginHorizontal: 4,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 12,
    elevation: 5,
    minWidth: 0,
    maxWidth: '100%',
  },
  statLabelCustom: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
    color: COLORS.text,
  },
  statValueCustom: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 22,
    color: COLORS.text,
    marginBottom: 4,
  },
  statValueCustom2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 4,
  },
  statSubCustom: {
    fontFamily: 'Lexend-Regular',
    fontSize: 14,
    color: COLORS.secondary,
    marginTop: 2,
  },
  statRowBg: {
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  shadowWrapper: {
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 18,
    elevation: 5,
    borderRadius: 22,
    marginHorizontal: 4,
    marginBottom: 18,
  },
  cardCustom: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
  },
  hydrationCardCustom: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    shadowColor: isDark ? '#000' : '#000',
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  hydrationCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hydrationProgressContainer: {
    marginRight: 20,
  },
  hydrationBottleContainer: {
    width: 60,
    height: 120,
    backgroundColor: COLORS.border,
    borderRadius: 7,
    overflow: 'hidden',
    position: 'relative',
  },
  hydrationBottleFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.primaryLight,
    minHeight: 20,
  },
  hydrationIconPercentageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  hydrationDropIcon: {
    marginBottom: 2, // Small gap between icon and percentage
  },
  hydrationPercentage: {
    fontFamily: 'Lexend-Bold',
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  hydrationDetailsSection: {
    flex: 1,
  },
  hydrationProgressText: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sleepCardCustom: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 22,
    marginHorizontal: 4,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 12,
    elevation: 5,
    minWidth: 0,
    maxWidth: '100%',
  },
  sleepLabelCustom: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
    color: COLORS.text,
  },
  sleepTimeCustom: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 28,
    color: COLORS.text,
    marginBottom: 4,
  },
  sleepRefreshedCustom: {
    fontFamily: 'Manrope-Regular',
    fontSize: 16,
    color: COLORS.secondary,
  },
  logSleepBtnCustom: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  logSleepBtnTextCustom: {
    color: COLORS.primary,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
  },
  stepsCardCustom: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 22,
    marginHorizontal: 4,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 12,
    elevation: 5,
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'center',
  },
  stepsLabelCustom: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
    color: COLORS.text,
  },
  stepsCountCustom: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 22,
    color: COLORS.text,
    marginBottom: 2,
  },
  stepsGoodCustom: {
    fontFamily: 'Manrope-Regular',
    fontSize: 16,
    color: COLORS.secondary,
  },
  sleepCardV2: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 6,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 18,
    elevation: 6,
    minWidth: 0,
    maxWidth: '100%',
  },
  sleepLabelV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
    color: COLORS.text,
  },
  sleepTimeV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 32,
    color: COLORS.text,
    marginBottom: 6,
  },
  sleepRefreshedV2: {
    fontFamily: 'Manrope-Regular',
    fontSize: 17,
    color: COLORS.muted,
  },
  logSleepBtnV2: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  logSleepBtnTextV2: {
    color: COLORS.primary,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
  },
  stepsCardV2: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 6,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 18,
    elevation: 6,
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'center',
  },
  stepsLabelV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
    color: COLORS.text,
  },
  stepsCountV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 24,
    color: COLORS.text,
    marginBottom: 2,
  },
  stepsGoodV2: {
    fontFamily: 'Manrope-Regular',
    fontSize: 17,
    color: COLORS.muted,
  },
  weightJourneyCardV2: {
    backgroundColor: COLORS.card,
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 6,
    marginBottom: 18,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 18,
    elevation: 6,
  },
  weightJourneyLabelV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
    color: COLORS.text,
  },
  weightJourneySubV2: {
    fontFamily: 'Manrope-Regular',
    fontSize: 15,
    color: COLORS.neutralSecondary,
    marginBottom: 2,
  },
  weightJourneyCurrentV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 24,
    color: COLORS.text,
  },
  weightJourneyGoalV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 24,
    color: COLORS.primary,
  },
  weightJourneyBarBgV2: {
    height: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 6,
    marginBottom: 18,
    marginTop: 2,
    overflow: 'hidden',
  },
  weightJourneyBarFillV2: {
    height: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  weightJourneyBarBehind: {
    height: 10,
    backgroundColor: '#EF4444', // Red color for behind goal
    borderRadius: 6,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  weightJourneyBtnV2: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  weightJourneyBtnTextV2: {
    color: COLORS.primary,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 20,
  },
  habitsCardV2: {
    backgroundColor: COLORS.card,
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 6,
    marginBottom: 18,
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 18,
    elevation: 6,
  },
  habitsTitleV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 18,
  },
  habitRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  habitTextV2: {
    fontFamily: 'Lexend-Regular',
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  habitCheckFilledV2: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    marginLeft: 12,
  },
  habitCheckEmptyV2: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginLeft: 12,
  },
  recentMealsHeaderV2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
    marginBottom: 10,
    marginTop: 8,
    marginLeft: 20,
    marginRight: 20,
  },
  recentMealsTitleV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 20,
    color: COLORS.text,
  },
  recentMealsScrollV2: {
    marginLeft: 20,
    marginRight: 20,
    marginBottom: 18,
  },
  mealCardV2: {
    width: 142,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 12,
    marginRight: 16,
    alignItems: 'center',
    shadowColor: isDark ? '#000' : '#181A20',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: 12,
    elevation: 5,
  },
  mealImgV2: {
    width: 90,
    height: 90,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: COLORS.primaryLight,
  },
  mealNameV2: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 2,
  },
  mealKcalV2: {
    fontFamily: 'Manrope-Regular',
    fontSize: 15,
    color: COLORS.neutralSecondary,
  },
  
  // Goals Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  goalsModalContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    width: '100%',
    maxHeight: '80%',
    ...SHADOW.lg,
  },
  goalsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  goalsModalTitle: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: COLORS.text,
  },
  goalsModalCloseButton: {
    padding: 4,
  },
  goalsModalContent: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  goalSection: {
    marginVertical: 12,
  },
  goalSectionTitle: {
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    color: COLORS.text,
    marginBottom: 8,
  },
  calorieGoalCard: {
    backgroundColor: COLORS.cardSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  calorieGoalRange: {
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
  calorieGoalTarget: {
    fontSize: 14,
    fontFamily: 'Manrope-Medium',
    color: COLORS.secondary,
    marginBottom: 8,
  },
  calorieGoalMessage: {
    fontSize: 14,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
    lineHeight: 20,
  },
  checkInSummaryCard: {
    backgroundColor: COLORS.cardSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkInSummaryText: {
    fontSize: 14,
    fontFamily: 'Manrope-Medium',
    color: COLORS.text,
    marginBottom: 4,
  },
  insightCard: {
    backgroundColor: isDark ? 'rgba(251, 191, 36, 0.12)' : '#FFF7ED',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(251, 191, 36, 0.4)' : '#FED7AA',
  },
  insightText: {
    fontSize: 13,
    fontFamily: 'Manrope-Regular',
    color: COLORS.secondary,
    lineHeight: 18,
  },
  goalsModalButton: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 20,
    marginVertical: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  goalsModalButtonText: {
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    color: COLORS.card,
  },
  fireIconContainer: {
    position: 'relative',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kcalText: {
    position: 'absolute',
    fontSize: 10,
    fontFamily: 'Lexend-Bold',
    color: '#FFFFFF',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Manrope-Medium',
    color: COLORS.neutralSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  congratulationsContainer: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  congratulationsText: {
    fontSize: 14,
    fontFamily: 'Lexend-Bold',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 4,
  },
});
};

const createShadowStyles = (COLORS, isDark) => ({
  md: {
    shadowColor: isDark ? '#000' : COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.07,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: isDark ? '#000' : COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.4 : 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
});

const createFooterStyles = (colors, isDark) => StyleSheet.create({
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
    backgroundColor: isDark ? colors.cardSecondary || 'rgba(24, 32, 44, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 35,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: isDark ? '#000' : colors.primary || '#7B61FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 20,
    elevation: 16,
    ...(Platform.OS === 'ios' && {
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.85)',
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'relative',
  },
  activeTab: {},
  label: {
    fontSize: 12,
    marginTop: 4,
    color: colors.textSecondary || '#232B3A',
    letterSpacing: 0.1,
    fontWeight: '500',
  },
  activeLabel: {
    color: colors.primary || '#7B61FF',
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 30,
    height: 3,
    backgroundColor: colors.primary || '#7B61FF',
    borderRadius: 2,
  },
});

const createStreakStyles = (colors, isDark) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 115, 64, 0.18)' : '#FEF3F2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  emoji: {
    fontSize: 14,
    marginRight: 4,
  },
  text: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 12,
    color: colors.text || '#181A20',
  },
});

const createPalette = (colors, isDark) => ({
  primary: colors.primary || '#7B61FF',
  primaryLight: isDark ? 'rgba(123, 97, 255, 0.18)' : '#F3F0FF',
  text: colors.text || (isDark ? '#F8FAFC' : '#11181C'),
  secondary: colors.textSecondary || (isDark ? '#CBD5F5' : '#4B5563'),
  muted: isDark ? '#9CA3AF' : '#9CA3AF',
  placeholder: isDark ? '#6B7280' : '#D1D5DB',
  background: colors.background || (isDark ? '#0F172A' : '#F9FAFB'),
  card: colors.card || (isDark ? '#1E2533' : '#FFFFFF'),
  cardSecondary: colors.cardSecondary || (isDark ? '#1F2937' : '#FFFFFF'),
  border: colors.border || (isDark ? '#2F3645' : '#E5E7EB'),
  streak: colors.primary || '#7B61FF',
  streakBg: isDark ? 'rgba(123, 97, 255, 0.12)' : '#F3F0FF',
  water: colors.primary || '#7B61FF',
  weight: colors.primary || '#7B61FF',
  coins: colors.primary || '#7B61FF',
  rituals: colors.primary || '#7B61FF',
  surfaceMuted: isDark ? '#1A2130' : '#F6F7FB',
  greetingCardBg: isDark ? (colors.cardSecondary || '#1F2635') : '#EAF3FF',
  accentOrange: isDark ? '#FF9E6E' : '#FF6B35',
  accentBlue: isDark ? '#60A5FA' : '#3B82F6',
  neutralIcon: isDark ? '#CBD5F5' : '#444',
  neutralSecondary: isDark ? '#A0AEC0' : '#666',
  stepsIcon: isDark ? '#E2E8F0' : '#222',
  sleepAccent: isDark ? '#D8B4FE' : '#7C3AED',
  sleepCardBg: isDark ? 'rgba(124, 58, 237, 0.18)' : '#E6D6F6',
  stepsCardBg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#B6E6F6',
  stepsBadgeBg: isDark ? 'rgba(148, 163, 184, 0.24)' : '#E0F7FA',
});

export default React.memo(MainDashboardScreen); 