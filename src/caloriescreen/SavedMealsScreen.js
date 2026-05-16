import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import supabase from '../lib/supabase';

// Global cache for saved meals data
const globalSavedMealsCache = {
  cachedData: null,
  lastFetchTime: 0,
  isFetching: false,
  CACHE_DURATION: 60000, // 60 seconds
  STALE_TIME: 10000, // 10 seconds
  cacheHits: 0,
  cacheMisses: 0,
};
const FILTERS = [
  'All Meals',
  'High Protein',
  'Low Carb',
  'Under 400 kcal',
];

const placeholderImg = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop';

const SavedMealsScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  // Initialize state with cached data (Instagram pattern)
  const [meals, setMeals] = useState(() => globalSavedMealsCache.cachedData?.meals || []);
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All Meals');
  const [loading, setLoading] = useState(() => !globalSavedMealsCache.cachedData);
  
  // Check if we need to force refresh (e.g., after saving a new meal)
  const shouldForceRefresh = route?.params?.refresh === true;

  useFocusEffect(
    useCallback(() => {
      // Force refresh if requested (e.g., after saving a new meal)
      if (shouldForceRefresh) {
        globalSavedMealsCache.cachedData = null;
        globalSavedMealsCache.lastFetchTime = 0;
        // Clear the refresh param to prevent infinite refresh
        if (route?.params?.refresh) {
          navigation.setParams({ refresh: false });
        }
      }
      
      const now = Date.now();
      const timeSinceLastFetch = now - globalSavedMealsCache.lastFetchTime;
      const isStale = timeSinceLastFetch > globalSavedMealsCache.STALE_TIME;
      const isFresh = timeSinceLastFetch < globalSavedMealsCache.CACHE_DURATION;
      
      // SWR Pattern: Stale-While-Revalidate (like Instagram)
      // Skip cache if forced refresh
      if (!shouldForceRefresh && globalSavedMealsCache.cachedData && isFresh) {
        // Data is fresh - use cache, no revalidation needed
        setMeals(globalSavedMealsCache.cachedData.meals || []);
        setLoading(false);
        globalSavedMealsCache.cacheHits++;
        return; // Fresh cache - no fetch needed
      }
      
      if (!shouldForceRefresh && globalSavedMealsCache.cachedData && isStale && !isFresh) {
        // Data is stale but within cache duration - show stale, revalidate in background
        setMeals(globalSavedMealsCache.cachedData.meals || []);
        setLoading(false);
        globalSavedMealsCache.cacheHits++;
        // Continue to fetch fresh data in background (don't return)
      }
      
      // Prevent concurrent fetches
      if (globalSavedMealsCache.isFetching) return;
      
      globalSavedMealsCache.isFetching = true;
      globalSavedMealsCache.cacheMisses++;
      
      const fetchMeals = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;
          if (!userId) {
            globalSavedMealsCache.cachedData = { meals: [] };
            setMeals([]);
            setLoading(false);
            return;
          }
          
          const { data, error } = await supabase
            .from('saved_meal')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          
          if (error || !data) {
            globalSavedMealsCache.cachedData = { meals: [] };
            setMeals([]);
            setLoading(false);
            return;
          }
          
          // Map saved_meal to meal card format with signed URLs
          const mapped = await Promise.all(data.map(async (log) => {
            let imageUrl = placeholderImg;
            
            // If we have a photo_url (storage path), generate a signed URL
            if (log.photo_url && !log.photo_url.startsWith('http')) {
              try {
                const { data: signedUrlData } = await supabase.storage
                  .from('food-photos')
                  .createSignedUrl(log.photo_url, 60 * 60); // 1 hour expiry
                
                if (signedUrlData?.signedUrl) {
                  imageUrl = signedUrlData.signedUrl;
                }
              } catch (error) {
                // Fallback to placeholder if signed URL generation fails
              }
            } else if (log.photo_url && log.photo_url.startsWith('http')) {
              // If it's already a full URL, use it directly
              imageUrl = log.photo_url;
            }
            
            return {
              id: log.id, // Include the database ID for deletion
              dish_name: log.dish_name,
              total_nutrition: { calories: Number(log.calories) },
              macros: {
                protein: Number(log.protein || 0),
                carbs: Number(log.carbs || 0),
                fat: Number(log.fat || 0),
              },
              image: imageUrl,
            };
          }));
          
          // Only update state if data actually changed
          const newDataString = JSON.stringify(mapped);
          const currentDataString = JSON.stringify(meals);
          if (newDataString !== currentDataString) {
            setMeals(mapped);
          }
          
          // Cache the data
          globalSavedMealsCache.cachedData = { meals: mapped };
          globalSavedMealsCache.lastFetchTime = Date.now();
          setLoading(false);
        } catch (error) {
          // Silent error handling
        } finally {
          globalSavedMealsCache.isFetching = false;
        }
      };
      
      fetchMeals();
    }, [meals, shouldForceRefresh, navigation, route])
  );

  // Filtering logic for both search and filter chips
  const filteredMeals = meals.filter(meal => {
    // Search by meal name
    const matchesSearch = meal.dish_name.toLowerCase().includes(search.toLowerCase());
    // Filter by selected filter
    let matchesFilter = true;
    if (selectedFilter === 'High Protein') {
      matchesFilter = meal.macros.protein > 20;
    } else if (selectedFilter === 'Low Carb') {
      matchesFilter = meal.macros.carbs < 20;
    } else if (selectedFilter === 'Under 400 kcal') {
      matchesFilter = meal.total_nutrition.calories < 400;
    }
    return matchesSearch && matchesFilter;
  });

  const handleDelete = async (idx) => {
    try {
      const mealToDelete = meals[idx];
      if (!mealToDelete || !mealToDelete.id) {
        Alert.alert('Error', 'Cannot delete this meal.');
        return;
      }

      // Optimistic update - remove from UI immediately
      const updatedMeals = meals.filter((_, i) => i !== idx);
      setMeals(updatedMeals);
      
      // Update cache immediately
      if (globalSavedMealsCache.cachedData) {
        globalSavedMealsCache.cachedData.meals = updatedMeals;
        globalSavedMealsCache.lastFetchTime = Date.now();
      }

      // Delete from database
      const { error } = await supabase
        .from('saved_meal')
        .delete()
        .eq('id', mealToDelete.id);

      if (error) {
        // Rollback optimistic update on error
        setMeals(meals);
        if (globalSavedMealsCache.cachedData) {
          globalSavedMealsCache.cachedData.meals = meals;
        }
        Alert.alert('Error', 'Failed to delete meal from database.');
        return;
      }

      Alert.alert('Success', 'Meal deleted successfully!');
    } catch (error) {
      // Rollback optimistic update on error
      setMeals(meals);
      if (globalSavedMealsCache.cachedData) {
        globalSavedMealsCache.cachedData.meals = meals;
      }
      Alert.alert('Error', 'Failed to delete meal.');
    }
  };

  const handleAddToPlan = async (meal) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user?.id;
      if (!user_id) {
        Alert.alert('You must be logged in to log food.');
        return;
      }
      
      const now = new Date();
      const logData = {
        user_id,
        food_name: meal.dish_name,
        serving_size: 1,
        calories: meal.total_nutrition.calories,
        protein: meal.macros.protein,
        carbs: meal.macros.carbs,
        fat: meal.macros.fat,
        fiber: meal.macros.fiber || 0,
        created_at: now.toISOString(),
        meal_type: 'Saved Meal',
        notes: '',
        photo_url: meal.image, // Include the photo URL from saved meal
      };
      
      const { error } = await supabase.from('user_food_logs').insert([logData]);
      if (error) throw error;
      
      // Update cache optimistically
      const { updateHomeScreenCacheOptimistic } = require('../utils/cacheManager');
      updateHomeScreenCacheOptimistic(logData);
      
      Alert.alert('Success', 'Meal added to today\'s plan!', [
        { text: 'OK', onPress: () => {
            // Navigate to Home and trigger refresh
            if (navigation && navigation.navigate) {
              navigation.navigate('Home', { refresh: true });
            }
          }
        }
      ]);
    } catch (e) {
      console.error('Error adding meal to plan:', e);
      Alert.alert('Error', 'Failed to add meal to plan.');
    }
  };

  const renderMeal = ({ item, index }) => (
    <View style={styles.mealCard}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: item.image || placeholderImg }} style={styles.mealImg} />
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(index)}>
          <Ionicons name="trash" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.mealName}>{item.dish_name}</Text>
      <View style={styles.kcalRow}>
        <MaterialCommunityIcons name="fire" size={18} color="#FF9100" />
        <Text style={styles.kcalText}>{item.total_nutrition.calories} kcal</Text>
      </View>
      <View style={styles.macrosRow}>
        <View style={styles.macroItem}><MaterialCommunityIcons name="fish" size={16} color="#3B82F6" /><Text style={styles.macroText}>{item.macros.protein}g</Text></View>
        <View style={styles.macroItem}><MaterialCommunityIcons name="rice" size={16} color="#F59E42" /><Text style={styles.macroText}>{item.macros.carbs}g</Text></View>
        <View style={styles.macroItem}><MaterialCommunityIcons name="egg" size={16} color="#FBBF24" /><Text style={styles.macroText}>{item.macros.fat}g</Text></View>
      </View>
      <TouchableOpacity style={styles.addToPlanBtn} onPress={() => handleAddToPlan(item)}>
        <Text style={styles.addToPlanText}>Add to Plan</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Meals</Text>
        <View style={styles.headerAddBtn} />
      </View>
      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.filterBtn}><Ionicons name="filter" size={18} color={colors.textSecondary} /><Text style={styles.filterText}>Filters</Text></TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, selectedFilter === f && styles.chipActive]}
              onPress={() => setSelectedFilter(f)}
            >
              <Text style={[styles.chipText, selectedFilter === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {/* Search Bar */}
      <View style={styles.searchBarWrap}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filteredMeals}
        renderItem={renderMeal}
        keyExtractor={(_, idx) => idx.toString()}
        numColumns={2}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom >= 20 ? (32 + insets.bottom) : 32 }]}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerAddBtn: { padding: 4 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
    marginTop: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  filterText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  chip: {
    backgroundColor: colors.cardBackground,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  smartSortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  smartSortText: {
    color: colors.primary,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  grid: {
    paddingHorizontal: 14,
    paddingBottom: 32,
    paddingTop: 8,
  },
  mealCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    margin: 8,
    flex: 1,
    minWidth: 160,
    maxWidth: '48%',
    padding: 12,
    shadowColor: colors.shadow,
    shadowOpacity: isDark ? 0.3 : 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageWrap: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealImg: {
    width: '100%',
    height: 110,
    borderRadius: 16,
    resizeMode: 'cover',
  },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#222',
    borderRadius: 16,
    padding: 4,
    zIndex: 2,
  },
  mealName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
    marginTop: 2,
  },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  kcalText: {
    fontSize: 15,
    color: '#FF9100',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  macrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  macroItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  macroText: {
    fontSize: 14,
    color: colors.textPrimary,
    marginLeft: 4,
  },
  addToPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    marginTop: 4,
  },
  addToPlanText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  searchBarWrap: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBar: {
    backgroundColor: colors.cardBackground,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    shadowColor: colors.shadow,
    shadowOpacity: isDark ? 0.2 : 0.03,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

// Export cache for external access
export { globalSavedMealsCache };

export default SavedMealsScreen; 