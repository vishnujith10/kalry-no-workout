import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import supabase from '../lib/supabase';
import { getFoodLogs } from '../utils/api';

// Global cache for progress data
const globalProgressCache = {
  cachedData: null,
  timestamp: null,
  isStale: false,
  CACHE_DURATION: 5000, // 5 seconds
};

const screenWidth = Dimensions.get('window').width - 32;

const RANGES = [
  { key: 'this_week', label: 'This Week', days: 7, offsetWeeks: 0 },
  { key: 'last_week', label: 'Last Week', days: 7, offsetWeeks: 1 },
  { key: 'one_month', label: '1 Month', days: 30 },
  { key: 'ninety_days', label: '90 Days', days: 90 },
];

// Fixed date utility functions with timezone handling
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function getRangeDates(range) {
  // Use local timezone to avoid UTC conversion issues
  const now = new Date();
  
  // Debug: Log the current date
  console.log('getRangeDates - Current date:', now.toISOString());
  console.log('getRangeDates - Current year:', now.getFullYear());
  
  if (range.key === 'this_week') {
    // This week: Monday to Sunday of current week
    const today = new Date(now);
    const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Calculate days since Monday (handle Sunday as day 0)
    const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    
    // Get Monday of this week
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysSinceMonday);
    monday.setHours(0, 0, 0, 0);
    
    // Get Sunday of this week
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    // Debug logging for this week calculation
    console.log('getRangeDates - This Week Calculation:');
    console.log('  Today:', today.toISOString());
    console.log('  Current day of week:', currentDayOfWeek);
    console.log('  Days since Monday:', daysSinceMonday);
    console.log('  This week Monday:', monday.toISOString());
    console.log('  This week Sunday:', sunday.toISOString());
    
    return { start: monday, end: sunday };
    
  } else if (range.key === 'last_week') {
    // Last week: Monday to Sunday of previous week
    const today = new Date(now);
    const currentDayOfWeek = today.getDay();
    const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    
    // Get Monday of this week first
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() - daysSinceMonday);
    thisWeekMonday.setHours(0, 0, 0, 0);
    
    // Go back 7 days to get last week's Monday
    const lastWeekMonday = new Date(thisWeekMonday);
    lastWeekMonday.setDate(thisWeekMonday.getDate() - 7);
    lastWeekMonday.setHours(0, 0, 0, 0); // Ensure it's start of day
    
    // Get last week's Sunday (this week's Monday - 1 day)
    const lastWeekSunday = new Date(thisWeekMonday);
    lastWeekSunday.setDate(thisWeekMonday.getDate() - 1);
    lastWeekSunday.setHours(23, 59, 59, 999);
    
    // Debug logging for last week calculation
    console.log('getRangeDates - Last Week Calculation:');
    console.log('  Today:', today.toISOString());
    console.log('  Current day of week:', currentDayOfWeek);
    console.log('  Days since Monday:', daysSinceMonday);
    console.log('  This week Monday:', thisWeekMonday.toISOString());
    console.log('  Last week Monday:', lastWeekMonday.toISOString());
    console.log('  Last week Sunday:', lastWeekSunday.toISOString());
    
    return { start: lastWeekMonday, end: lastWeekSunday };
    
  } else if (range.key === 'one_month') {
    // 1 Month: Last 30 days including today
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    
    const start = new Date(now);
    start.setDate(now.getDate() - 29); // 30 days total including today
    start.setHours(0, 0, 0, 0);
    
    return { start, end };
    
  } else if (range.key === 'ninety_days') {
    // 90 Days: Last 90 days including today
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    
    const start = new Date(now);
    start.setDate(now.getDate() - 89); // 90 days total including today
    start.setHours(0, 0, 0, 0);
    
    return { start, end };
  }
  
  // Fallback
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(now);
  start.setDate(now.getDate() - (range.days - 1));
  start.setHours(0, 0, 0, 0);
  
  return { start, end };
}

function groupByDay(logs, start, end, rangeKey = null) {
  console.log(`groupByDay called with rangeKey: ${rangeKey}`);
  console.log(`groupByDay - logs length: ${logs ? logs.length : 'undefined'}`);
  console.log(`groupByDay - start: ${start.toISOString()}`);
  console.log(`groupByDay - end: ${end.toISOString()}`);
  
  // Safety check for logs
  if (!Array.isArray(logs)) {
    console.log('groupByDay: logs is not an array, returning empty days');
    return [];
  }
  
  // Create array of days in the range using LOCAL dates
  const days = [];
  const cursor = new Date(start);
  
  while (cursor <= end) {
    days.push({ 
      date: new Date(cursor), 
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  
  // Process each log and add to appropriate day
  console.log(`groupByDay - Processing ${logs.length} logs`);
  logs.forEach((log, index) => {
    // Safety check for log object
    if (!log || !log.created_at) {
      console.log('groupByDay: Invalid log object, skipping');
      return;
    }
    
    // Debug first few logs
    if (index < 3) {
      console.log(`groupByDay - Log ${index}:`, {
        date: log.created_at,
        food: log.food_name,
        calories: log.calories
      });
    }
    
    const logDate = new Date(log.created_at);
    
    // Check if logDate is valid
    if (isNaN(logDate.getTime())) {
      console.log('groupByDay: Invalid log date, skipping');
      return;
    }
    
    // Convert to local date string for comparison (YYYY-MM-DD format)
    // Use LOCAL time components, not UTC
    const logDateStr = logDate.getFullYear() + '-' + 
      String(logDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(logDate.getDate()).padStart(2, '0');
    
    // Use LOCAL dates for range comparison
    const startDateStr = start.getFullYear() + '-' + 
      String(start.getMonth() + 1).padStart(2, '0') + '-' + 
      String(start.getDate()).padStart(2, '0');
    const endDateStr = end.getFullYear() + '-' + 
      String(end.getMonth() + 1).padStart(2, '0') + '-' + 
      String(end.getDate()).padStart(2, '0');
    
    // Debug logging for date comparison
    if (rangeKey === 'last_week' || rangeKey === 'this_week') {
      console.log(`groupByDay - ${rangeKey} Debug:`);
      console.log(`  Log date: ${logDateStr}`);
      console.log(`  Start date: ${startDateStr}`);
      console.log(`  End date: ${endDateStr}`);
      console.log(`  In range: ${logDateStr >= startDateStr && logDateStr <= endDateStr}`);
    }
    
    if (logDateStr >= startDateStr && logDateStr <= endDateStr) {
      // Find the matching day in our array using date string comparison with LOCAL dates
      const matchingDayIndex = days.findIndex(day => {
        const dayDateStr = day.date.getFullYear() + '-' + 
          String(day.date.getMonth() + 1).padStart(2, '0') + '-' + 
          String(day.date.getDate()).padStart(2, '0');
        return dayDateStr === logDateStr;
      });
      
      if (matchingDayIndex !== -1) {
        const calories = Number(log.calories || 0);
        const protein = Number(log.protein || 0);
        const carbs = Number(log.carbs || 0);
        const fat = Number(log.fat || 0);
        
        // Debug logging
        if (rangeKey === 'last_week' || rangeKey === 'this_week') {
          console.log(`groupByDay - Adding to day ${matchingDayIndex}: ${calories} calories`);
        }
        
        days[matchingDayIndex].calories += calories;
        days[matchingDayIndex].protein += protein;
        days[matchingDayIndex].carbs += carbs;
        days[matchingDayIndex].fat += fat;
      } else {
        // Debug logging - why no match found
        if (rangeKey === 'last_week' || rangeKey === 'this_week') {
          console.log(`groupByDay - No matching day found for log date: ${logDateStr}`);
          console.log(`groupByDay - Available days:`, days.map(d => {
            const dayDateStr = d.date.getFullYear() + '-' + 
              String(d.date.getMonth() + 1).padStart(2, '0') + '-' + 
              String(d.date.getDate()).padStart(2, '0');
            return dayDateStr;
          }));
        }
      }
    }
  });
  
  return days;
}

export default function ProgressScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [activeRange, setActiveRange] = useState(RANGES[0]);
  const [activeMetric, setActiveMetric] = useState('calories');
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  
  // Initialize with cached data
  const [daily, setDaily] = useState(() => globalProgressCache.cachedData?.daily || []);
  const [totals, setTotals] = useState(() => globalProgressCache.cachedData?.totals || { 
    total: 0, 
    average: 0, 
    best: 0, 
    worst: 0, 
    bestDate: null, 
    worstDate: null, 
    streak: 0 
  });
  const [prevTotal, setPrevTotal] = useState(() => globalProgressCache.cachedData?.prevTotal || null);
  const [userGoal, setUserGoal] = useState(() => globalProgressCache.cachedData?.userGoal || null);
  const [logsCount, setLogsCount] = useState(() => globalProgressCache.cachedData?.logsCount || 0);
  


  // Cache-first data fetching with useFocusEffect
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        const now = Date.now();
        const isCacheValid = globalProgressCache.timestamp && 
          (now - globalProgressCache.timestamp) < globalProgressCache.CACHE_DURATION;

        // Check if cache is for the same range
        const cacheRangeKey = globalProgressCache.cachedData?.rangeKey;
        const isSameRange = cacheRangeKey === activeRange.key;

        // If cache is fresh and for the same range, use it and skip fetch
        if (isCacheValid && globalProgressCache.cachedData && isSameRange) {
          const cached = globalProgressCache.cachedData;
          setDaily(cached.daily || []);
          setTotals(cached.totals || { total: 0, average: 0, best: 0, worst: 0, bestDate: null, worstDate: null, streak: 0 });
          setPrevTotal(cached.prevTotal || null);
          setUserGoal(cached.userGoal || null);
          setLogsCount(cached.logsCount || 0);
          return;
        }

        // If cache is stale, use it immediately but fetch fresh data
        if (globalProgressCache.cachedData && globalProgressCache.isStale) {
          const cached = globalProgressCache.cachedData;
          setDaily(cached.daily || []);
          setTotals(cached.totals || { total: 0, average: 0, best: 0, worst: 0, bestDate: null, worstDate: null, streak: 0 });
          setPrevTotal(cached.prevTotal || null);
          setUserGoal(cached.userGoal || null);
          setLogsCount(cached.logsCount || 0);
        }

        // Fetch fresh data
        if (isFetching) return;
        setIsFetching(true);
        setLoading(true);
        
        try {
        
          // Get date range for the selected period
          const { start, end } = getRangeDates(activeRange);
          
          // Debug logging
          console.log(`ProgressScreen - Range: ${activeRange.key}`);
          console.log(`ProgressScreen - Start: ${start.toISOString()}`);
          console.log(`ProgressScreen - End: ${end.toISOString()}`);
          console.log(`ProgressScreen - Total logs fetched: ${logs ? logs.length : 0}`);
          
          // Debug: Log sample log dates
          if (logs && logs.length > 0) {
            console.log(`ProgressScreen - Sample log dates:`, logs.slice(0, 3).map(log => ({
              date: log.created_at,
              food: log.food_name,
              calories: log.calories
            })));
            
            // Debug: Log all log dates for last week
            if (activeRange.key === 'last_week') {
              console.log(`ProgressScreen - All log dates for Last Week:`, logs.map(log => ({
                date: log.created_at,
                food: log.food_name,
                calories: log.calories
              })));
            }
          }
          
          // Fetch user's profile for adaptive goal calculation
          const { data: profile } = await supabase.from('user_profile')
            .select('calorie_goal, weight, height, age, gender, activity_level, goal')
            .eq('id', userId)
            .single();
          const userGoalValue = profile?.calorie_goal ? Number(profile.calorie_goal) : null;
          

          
          // Fetch all food logs with proper error handling
          let logs = [];
          try {
            const fetchedLogs = await getFoodLogs(userId);
            logs = Array.isArray(fetchedLogs) ? fetchedLogs : [];
          } catch (error) {
            console.log('getFoodLogs failed, trying direct Supabase query:', error.message);
            try {
              const { data: supabaseLogs, error: supabaseError } = await supabase
                .from('user_food_logs')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
              
              if (supabaseError) {
                console.log('Supabase query error:', supabaseError.message);
                logs = [];
              } else {
                logs = Array.isArray(supabaseLogs) ? supabaseLogs : [];
              }
            } catch (directError) {
              console.log('Direct Supabase query failed:', directError.message);
              logs = [];
            }
          }
          
          // Group logs by day
          console.log(`ProgressScreen - About to call groupByDay with ${logs ? logs.length : 0} logs`);
          console.log(`ProgressScreen - Range key: ${activeRange.key}`);
          console.log(`ProgressScreen - Start date: ${start.toISOString()}`);
          console.log(`ProgressScreen - End date: ${end.toISOString()}`);
          console.log(`ProgressScreen - Start date string: ${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`);
          console.log(`ProgressScreen - End date string: ${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`);
          
          const perDay = groupByDay(logs, start, end, activeRange.key);
          
          // Debug logging for grouped data
          console.log(`ProgressScreen - Days in range: ${perDay ? perDay.length : 0}`);
          console.log(`ProgressScreen - Days with data: ${perDay ? perDay.filter(d => d.calories > 0).length : 0}`);
          console.log(`ProgressScreen - Total calories in range: ${perDay ? perDay.reduce((sum, d) => sum + d.calories, 0) : 0}`);
          
          // Log the actual perDay data for debugging
          if (activeRange.key === 'last_week' || activeRange.key === 'this_week') {
            console.log(`ProgressScreen - ${activeRange.key} perDay data:`, perDay);
          }
        
          // Calculate totals for the active metric
          const metricKey = activeMetric;
          const values = perDay ? perDay.map(d => Number(d[metricKey] || 0)) : [];
          const total = values.reduce((sum, val) => sum + val, 0);
          const daysWithData = values.filter(v => v > 0).length;
          const average = daysWithData > 0 ? total / daysWithData : 0;
          
          // Find best and worst days
          let best = 0, worst = 0, bestDate = null, worstDate = null;
          if (values.length > 0) {
            const nonZeroValues = values.filter(v => v > 0);
            if (nonZeroValues.length > 0) {
              best = Math.max(...values);
              worst = Math.min(...nonZeroValues); // Only consider days with data for worst
              const bestIndex = values.indexOf(best);
              const worstIndex = values.indexOf(worst);
              bestDate = perDay[bestIndex]?.date || null;
              worstDate = perDay[worstIndex]?.date || null;
            }
          }
          
          // Calculate streak (consecutive days with logged data from the end)
          let streak = 0;
          if (perDay && perDay.length > 0) {
            for (let i = perDay.length - 1; i >= 0; i--) {
              if ((perDay[i][metricKey] || 0) > 0) {
                streak++;
              } else {
                break;
              }
            }
          }
          
          const totalsData = { total, average, best, worst, bestDate, worstDate, streak };
          
          // Calculate previous period for comparison
          const prevRange = calculatePreviousRange(activeRange, start);
          const prevPerDay = groupByDay(logs, prevRange.start, prevRange.end, activeRange.key);
          const prevTotalValue = prevPerDay ? prevPerDay.reduce((sum, d) => sum + Number(d[metricKey] || 0), 0) : 0;
          
          // Update cache with range key
          globalProgressCache.cachedData = {
            daily: perDay,
            totals: totalsData,
            prevTotal: prevTotalValue,
            userGoal: userGoalValue,
            logsCount: logs ? logs.length : 0,
            rangeKey: activeRange.key, // Store the range key for cache validation
          };
          globalProgressCache.timestamp = Date.now();
          globalProgressCache.isStale = false;
          
          // Only update state if data has changed
          const currentDataString = JSON.stringify({ daily, totals, prevTotal, userGoal, logsCount });
          const newDataString = JSON.stringify({ 
            daily: perDay, 
            totals: totalsData, 
            prevTotal: prevTotalValue, 
            userGoal: userGoalValue, 
            logsCount: logs ? logs.length : 0 
          });
          
          if (currentDataString !== newDataString) {
            setDaily(perDay);
            setTotals(totalsData);
            setPrevTotal(prevTotalValue);
            setUserGoal(userGoalValue);
            setLogsCount(logs ? logs.length : 0);
          }
          
        } catch (error) {
          console.error('Error loading progress data:', error);
        } finally {
          setLoading(false);
          setIsFetching(false);
        }
      };
      
      load();
    }, [activeRange, activeMetric, isFetching, daily, logsCount, prevTotal, totals, userGoal, goalEngine])
  );

  // Helper function to calculate previous period range
  function calculatePreviousRange(currentRange, currentStart) {
    if (currentRange.key === 'this_week') {
      // This week vs last week
      return getRangeDates({ key: 'last_week', days: 7 });
    } else if (currentRange.key === 'last_week') {
      // Last week vs the week before last week
      const now = new Date();
      const today = new Date(now);
      const currentDayOfWeek = today.getDay();
      const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      
      // Get Monday of this week first
      const thisWeekMonday = new Date(today);
      thisWeekMonday.setDate(today.getDate() - daysSinceMonday);
      
      // Go back 14 days to get the week before last week's Monday
      const twoWeeksAgoMonday = new Date(thisWeekMonday);
      twoWeeksAgoMonday.setDate(thisWeekMonday.getDate() - 14);
      
      // Get the week before last week's Sunday
      const twoWeeksAgoSunday = new Date(twoWeeksAgoMonday);
      twoWeeksAgoSunday.setDate(twoWeeksAgoMonday.getDate() + 6);
      
      return { start: startOfDay(twoWeeksAgoMonday), end: endOfDay(twoWeeksAgoSunday) };
    } else {
      // For month and 90-day ranges, go back by the same number of days
      const days = currentRange.days || 30;
      const prevEnd = new Date(currentStart);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - (days - 1));
      return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
    }
  }

  const labels = useMemo(() => {
    if (activeRange.days <= 7) {
      // For weekly views, show day names
      return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    }
    
    // For longer ranges, show selected dates
    const count = daily ? daily.length : 0;
    const step = Math.max(1, Math.floor(count / 6));
    return daily ? daily.map((d, i) => {
      if (i % step === 0) {
        return `${d.date.getMonth() + 1}/${d.date.getDate()}`;
      }
      return '';
    }) : [];
  }, [daily, activeRange]);

  const metricLabel = activeMetric === 'calories' ? 'cal' : 'g';
  
  // Data points for chart
  const dataPoints = useMemo(() => {
    if (!daily || !Array.isArray(daily)) {
      return [];
    }
    
    if (activeRange.key === 'this_week' || activeRange.key === 'last_week') {
      // Weekly views: show daily values
      return daily.map(d => Math.round(d[activeMetric] || 0));
    } else {
      // Monthly and 90-day views: show cumulative totals
      let cumulative = 0;
      return daily.map(d => {
        cumulative += Number(d[activeMetric] || 0);
        return Math.round(cumulative);
      });
    }
  }, [daily, activeMetric, activeRange]);

  const deltaPct = useMemo(() => {
    if (prevTotal == null || !totals) return null;
    if (prevTotal === 0) return totals.total > 0 ? 100 : 0;
    return ((totals.total - prevTotal) / prevTotal) * 100;
  }, [prevTotal, totals]);

  // Determine what value to show in the main display
  const mainDisplayValue = useMemo(() => {
    if (activeRange.key === 'this_week') {
      // This Week: Show today's value for the selected metric
      const today = new Date();
      const todayData = daily ? daily.find(d => isSameDay(d.date, today)) : null;
      return Math.round(todayData?.[activeMetric] || 0);
    } else if (activeRange.key === 'last_week') {
      // Last Week: Show total
      return Math.round(totals?.total || 0);
    } else {
      // Month/90 days: Show total
      return Math.round(totals?.total || 0);
    }
  }, [activeRange, totals, daily, activeMetric]);

  const mainDisplayLabel = useMemo(() => {
    if (activeRange.key === 'this_week') {
      return `Today's ${activeMetric === 'calories' ? 'Calories' : activeMetric.charAt(0).toUpperCase() + activeMetric.slice(1)} - ${activeRange.label}`;
    } else {
      return `Total ${activeMetric === 'calories' ? 'Calories' : activeMetric.charAt(0).toUpperCase() + activeMetric.slice(1)} - ${activeRange.label}`;
    }
  }, [activeRange, activeMetric]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deep Insights</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: 16 }]}>
        <Text style={styles.sectionTitle}>Calories & Food Rituals</Text>

        <View style={styles.rangeRow}>
          {RANGES.map(r => (
            <TouchableOpacity
              key={r.key}
              onPress={() => setActiveRange(r)}
              style={[styles.rangeBtn, activeRange.key === r.key && styles.rangeBtnActive]}
            >
              <Text style={[styles.rangeText, activeRange.key === r.key && styles.rangeTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.displayLabel}>
          {mainDisplayLabel}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.loadingText, { color: colors.primary }]}>Loading...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.displayValue}>
                {mainDisplayValue}
              </Text>
              <Text style={styles.metricLabel}>
                {metricLabel}
              </Text>
            </>
          )}
        </View>

        {/* Metric selector */}
        <View style={styles.metricRow}>
          {['calories','protein','carbs','fat'].map(m => (
            <TouchableOpacity 
              key={m} 
              onPress={() => setActiveMetric(m)} 
              style={[styles.metricBtn, activeMetric === m && styles.metricBtnActive]}
            >
              <Text style={[styles.metricText, activeMetric === m && styles.metricTextActive]}>
                {m === 'calories' ? 'Calories' : m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.chartContainer}>
          <LineChart
            data={{ 
              labels, 
              datasets: [
                { 
                  data: dataPoints.length ? dataPoints : [0], 
                  color: (opacity = 1) => `rgba(123,97,255,${opacity})` 
                },
                ...(activeMetric === 'calories' && userGoal && 
                    (activeRange.key === 'this_week' || activeRange.key === 'last_week') ? 
                  [{ 
                    data: new Array(dataPoints.length || 7).fill(userGoal), 
                    color: (opacity = 1) => `rgba(40,167,69,${opacity})` 
                  }] : []
                )
              ] 
            }}
            width={screenWidth}
            height={220}
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: colors.cardBackground,
              backgroundGradientFrom: colors.cardBackground,
              backgroundGradientTo: colors.cardBackground,
              decimalPlaces: 0,
              color: (opacity = 1) => {
                const rgb = isDark ? '255, 255, 255' : '51, 51, 51';
                return `rgba(${rgb}, ${opacity})`;
              },
              labelColor: (opacity = 1) => {
                const rgb = isDark ? '176, 176, 176' : '102, 102, 102';
                return `rgba(${rgb}, ${opacity})`;
              },
              propsForDots: { r: '3', strokeWidth: '1', stroke: colors.primary },
            }}
            bezier
            withInnerLines={false}
            fromZero
            style={{ alignSelf: 'center' }}
          />
        </View>
        
        {/* Data Summary */}
        <View style={styles.dataSummaryCard}>
          <Text style={styles.dataSummaryTitle}>📊 Data Summary</Text>
          <Text style={styles.dataSummaryText}>Total logs: {logsCount}</Text>
          <Text style={styles.dataSummaryText}>Current metric: {activeMetric}</Text>
          <Text style={styles.dataSummaryText}>Period: {activeRange.label}</Text>
          <Text style={styles.dataSummaryText}>
            Chart shows: {activeRange.key === 'this_week' || activeRange.key === 'last_week' ? 'Daily values' : 'Cumulative totals'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>
              {activeRange.key === 'this_week' ? 'Today' : 'Total'}
            </Text>
            <Text style={styles.statValue}>
              {activeRange.key === 'this_week' ? 
                mainDisplayValue : 
                Math.round(totals.total || 0)
              } {metricLabel}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>
              {activeRange.key === 'this_week' ? 'Weekly Total' : 'Average Daily'}
            </Text>
            <Text style={styles.statValue}>
              {activeRange.key === 'this_week' ? 
                Math.round(totals.total || 0) : 
                Math.round(totals.average || 0)
              } {metricLabel}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Best Day</Text>
            <Text style={styles.statValue}>{Math.round(totals.best || 0)} {metricLabel}</Text>
            {totals.bestDate && (
              <Text style={styles.statDate}>
                {(totals.bestDate.getMonth() + 1) + '/' + totals.bestDate.getDate()}
              </Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Worst Day</Text>
            <Text style={styles.statValue}>{Math.round(totals.worst || 0)} {metricLabel}</Text>
            {totals.worstDate && (
              <Text style={styles.statDate}>
                {(totals.worstDate.getMonth() + 1) + '/' + totals.worstDate.getDate()}
              </Text>
            )}
          </View>
        </View>

        {deltaPct != null && (
          <View style={[styles.longCard, { marginTop: 12 }]}> 
            <Ionicons 
              name={deltaPct >= 0 ? 'trending-up' : 'trending-down'} 
              size={18} 
              color={deltaPct >= 0 ? '#22C55E' : '#EF4444'} 
            />
            <Text style={styles.deltaText}>
              {activeRange.label} vs previous: {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
            </Text>
          </View>
        )}

        {/* Adaptive Goal Display */}
        {adaptiveGoal && activeMetric === 'calories' && (
          <View style={[styles.longCard, styles.adaptiveGoalCard, { marginTop: 16 }]}>
            <Ionicons name="target" size={20} color="#0EA5E9" />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={[styles.statTitle, { color: '#0EA5E9', fontWeight: '700' }]}>
                Today&apos;s Adaptive Goal
              </Text>
              <Text style={[styles.statValue, { color: '#0369A1', fontSize: 18 }]}>
                {adaptiveGoal.min}-{adaptiveGoal.max} calories
              </Text>
              <Text style={[styles.dataSummaryText, { color: '#0369A1', marginTop: 4 }]}>
                {adaptiveGoal.displayMessage}
              </Text>
              {adaptiveGoal.reasons && adaptiveGoal.reasons.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {adaptiveGoal.reasons.slice(0, 2).map((reason, index) => (
                    <Text key={index} style={[styles.dataSummaryText, { color: '#0369A1', fontSize: 12 }]}>
                      • {reason.message || reason.explanation}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {(!daily || daily.length === 0) && !loading ? (
          <View style={styles.noDataCard}>
            <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
            <Text style={styles.noDataText}>No food logs found for this period</Text>
            <Text style={styles.noDataSubtext}>Start logging your meals to see your progress here</Text>
          </View>
        ) : (
          <Text style={styles.footerText}>
            Your calorie intake is based on your logged meals for the selected period.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  displayLabel: {
    color: colors.textSecondary,
    marginTop: 12,
  },
  displayValue: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
  },
  metricLabel: {
    color: colors.textSecondary,
    marginLeft: 6,
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
  },
  rangeRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  rangeBtnActive: {
    backgroundColor: colors.primary,
  },
  rangeText: { color: colors.textSecondary, fontWeight: '600' },
  rangeTextActive: { color: '#fff', fontWeight: '800' },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statTitle: { color: colors.textSecondary, marginBottom: 6 },
  statValue: { color: colors.textPrimary, fontSize: 24, fontWeight: '800' },
  statDate: {
    color: colors.textSecondary,
    marginTop: 4,
  },
  metricRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricBtn: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  metricBtnActive: { backgroundColor: colors.primary },
  metricText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  metricTextActive: { color: '#fff', fontWeight: '800' },
  chartContainer: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    paddingVertical: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  longCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deltaText: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginLeft: 8,
  },
  noDataCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noDataText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  noDataSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  dataSummaryCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dataSummaryTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  dataSummaryText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
    textAlign: 'center',
  },
  footerText: {
    color: colors.textSecondary,
    marginTop: 16,
  },
  adaptiveGoalCard: {
    backgroundColor: isDark ? '#1A2A3E' : '#F0F9FF',
    borderColor: '#0EA5E9',
  },
});