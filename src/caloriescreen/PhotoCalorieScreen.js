import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import supabase from '../lib/supabase';
import { createFoodLog } from '../utils/api';

const PhotoCalorieScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const { photoUri, mealType } = route.params;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [isLoading, setIsLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [editedFoodName, setEditedFoodName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);
  const [macros, setMacros] = useState({
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });

  const moodOptions = [
    { emoji: '😀', label: 'Happy' },
    { emoji: '😊', label: 'Content' },
    { emoji: '😐', label: 'Neutral' },
    { emoji: '😞', label: 'Sad' },
    { emoji: '😴', label: 'Tired' },
    { emoji: '😤', label: 'Stressed' },
  ];

  // Initialize Gemini AI
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || Constants.expoConfig?.extra?.EXPO_PUBLIC_GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('PhotoCalorieScreen - No API key found!');
  }
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const visionModels = ['gemini-2.0-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-8b'];

  useEffect(() => {
    if (photoUri) {
      analyzePhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUri]);

  const analyzePhoto = async () => {
    setIsLoading(true);
    try {
      // Timeout wrapper for network requests
      const raceWithTimeout = (promise, ms, timeoutMessage = 'Request timed out') => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms)),
        ]);
      };

      let lastError = null;

      for (const modelName of visionModels) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          
          const imageData = await FileSystem.readAsStringAsync(photoUri, {
            encoding: 'base64',
          });

          const prompt = `Analyze this food image and provide detailed nutritional information. Your response MUST be a single valid JSON object and nothing else. Do not include markdown formatting.

If the image does NOT contain recognizable food items, respond with: {"error": "No food items detected in this image. Please take a photo of food items."}

If food is detected, provide this exact JSON structure:
{
  "dish_name": "Main dish name (e.g., 'Grilled Chicken Salad')",
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": "estimated amount (e.g., '100g', '1 cup', '2 slices')"
    }
  ],
  "total_nutrition": {
    "calories": <number>,
    "protein": <number>,
    "fat": <number>,
    "carbs": <number>,
    "fiber": <number>,
    "micronutrients": {
      "iron": <boolean>,
      "potassium": <boolean>,
      "vitaminC": <boolean>,
      "calcium": <boolean>
    }
  },
  "confidence_level": <number between 0-100>
}

Guidelines:
- Be realistic with portion sizes
- Consider cooking methods (fried foods have more calories)
- Include all visible ingredients
- Provide nutritional values per the entire visible portion
- Confidence should reflect how clearly you can identify the food`;

          // Add timeout (30 seconds) for network requests
          const result = await raceWithTimeout(
            model.generateContent([
              prompt,
              { inlineData: { mimeType: "image/jpeg", data: imageData } },
            ]),
            30000,
            'Network request timed out. Please check your internet connection and try again.'
          );
          
          const response = await result.response;
          let text = response.text();
          
          console.log('PhotoCalorieScreen - Raw AI response:', text);
          
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            const jsonString = jsonMatch[0];
            console.log('PhotoCalorieScreen - Extracted JSON:', jsonString);
            const data = JSON.parse(jsonString);
            
            if (data.error) {
              throw new Error(data.error);
            }
            
            if (!data.dish_name || !data.total_nutrition || !Array.isArray(data.ingredients)) {
              throw new Error('Invalid JSON structure from API.');
            }
            
            setAnalysis(data);
            setCurrentAnalysis(data);
            setEditedFoodName(data.dish_name);
            setMacros({
              protein: data.total_nutrition.protein || 0,
              carbs: data.total_nutrition.carbs || 0,
              fat: data.total_nutrition.fat || 0,
              fiber: data.total_nutrition.fiber || 0,
            });
            
            console.log('PhotoCalorieScreen - Analysis complete:', data);
            return;
          } else {
            throw new Error('Invalid JSON format from API.');
          }
        } catch (error) {
          lastError = error;
          console.log(`Model ${modelName} failed:`, error.message);
        }
      }
      
      throw lastError || new Error('All AI models are currently unavailable.');
      
    } catch (error) {
      console.error('PhotoCalorieScreen - Analysis error:', error);
      const msg = String(error?.message || "").toLowerCase();
      
      // Network and timeout errors
      if (
        msg.includes("timed out") ||
        msg.includes("timeout") ||
        msg.includes("network request timed out")
      ) {
        Alert.alert(
          "Network Error",
          "Connection is slow or timed out. Please check your internet connection and try again."
        );
      } else if (
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("econnrefused") ||
        msg.includes("enotfound") ||
        msg.includes("err_internet_disconnected")
      ) {
        const isModelMissing = msg.includes('model') && msg.includes('not found');
        const title = isModelMissing ? 'Service Update Needed' : 'Network Error';
        const message = isModelMissing
          ? 'The selected AI model is no longer available. Please update to the latest app version or configure a supported Gemini model.'
          : 'Unable to connect. Please check your internet connection and try again.';
        Alert.alert(title, message);
      } else if (
        msg.includes("no food items detected") ||
        msg.includes("invalid json") ||
        msg.includes("no json object")
      ) {
        setShowErrorModal(true);
      } else {
        Alert.alert(
          "Analysis Failed", 
          "We couldn't analyze this image. Please try taking another photo with better lighting and food clearly visible."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    const analysisToUse = currentAnalysis || analysis;
    if (!analysisToUse) return;
    try {
      const { dish_name } = analysisToUse;
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user?.id;
      
      if (!user_id) {
        Alert.alert('You must be logged in to log food.');
        return;
      }
      
      // Get selected mood emoji
      const selectedMoodEmoji = selectedMood !== null ? moodOptions[selectedMood].emoji : null;
      
      // Upload photo to Supabase Storage
      let photoUrl = null;
      try {
        const fileName = `food_photos/${user_id}_${Date.now()}.jpg`;
        
        // Read the file using fetch
        const response = await fetch(photoUri);
        const arrayBuffer = await response.arrayBuffer();
        
        const { error: uploadError } = await supabase.storage
          .from('food-photos')
          .upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            upsert: false
          });
          
        if (uploadError) throw uploadError;
        
        // Store the storage path for later retrieval with signed URL
        photoUrl = fileName;
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
        // Continue without photo URL
      }

      const logData = {
        meal_type: mealType,
        food_name: editedFoodName || dish_name,
        calories: analysisToUse.total_nutrition.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        fiber: macros.fiber,
        mood: selectedMoodEmoji,
        photo_url: photoUrl,
        user_id,
        date: new Date().toISOString().slice(0, 10),
      };
      
      await createFoodLog(logData);
      
      // Show generic success message
      Alert.alert(
        "Food Logged! 🍽️",
        "Your meal has been manually logged successfully.",
        [{ 
          text: "Great!", 
          style: "default", 
          onPress: () => navigation.replace('Home') 
        }]
      );
      
      // Optimistic cache update
      const { updateMainDashboardCacheOptimistic, updateHomeScreenCacheOptimistic, updateMainDashboardStreakOptimistic } = require('../utils/cacheManager');
      updateMainDashboardCacheOptimistic(logData);
      updateHomeScreenCacheOptimistic(logData);
      updateMainDashboardStreakOptimistic(); // Trigger streak update
      
    } catch (error) {
      console.error('Error logging food:', error);
      Alert.alert('Error', 'Failed to log food. ' + error.message);
    }
  };

  const handleSaveToSavedMeals = async () => {
    const analysisToUse = currentAnalysis || analysis;
    if (!analysisToUse) return;
    try {
      const { dish_name, total_nutrition, ingredients } = analysisToUse;
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user?.id;
      
      if (!user_id) {
        Alert.alert('You must be logged in to save meals.');
        return;
      }

      const { error } = await supabase
        .from('saved_meals')
        .insert({
          user_id,
          name: editedFoodName || dish_name,
          ingredients: JSON.stringify(ingredients),
          calories: total_nutrition.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
          fiber: macros.fiber,
        });

      if (error) throw error;
      
      // Invalidate SavedMealsScreen cache to force refresh
      try {
        const { globalSavedMealsCache } = require('./SavedMealsScreen');
        if (globalSavedMealsCache) {
          globalSavedMealsCache.cachedData = null;
          globalSavedMealsCache.lastFetchTime = 0;
        }
      } catch (cacheError) {
        console.log('Could not invalidate cache:', cacheError);
      }
      
      Alert.alert(
        'Meal Saved! 💾', 
        `This meal has been added to your Saved Meals for easy logging later!`,
        [{ 
          text: 'Great!', 
          onPress: () => navigation.navigate('SavedMealsScreen', { refresh: true })
        }]
      );
      
    } catch (error) {
      console.error('Error saving meal:', error);
      Alert.alert('Error', 'Failed to save meal. ' + error.message);
    }
  };

  // Re-analyze food name using AI
  const handleReanalyzeFood = async () => {
    if (!editedFoodName || editedFoodName.trim().length < 2) {
      Alert.alert('Error', 'Please enter a valid food name');
      return;
    }

    if (!genAI) {
      Alert.alert('Error', 'AI service is not available');
      return;
    }

    setIsReanalyzing(true);
    try {
      const models = ['gemini-2.0-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-8b'];
      let lastError = null;

      for (const modelName of models) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });

          const prompt = `Analyze the following meal text: "${editedFoodName}". Your response MUST be a single valid JSON object and nothing else. Do not include markdown formatting like \`\`\`json.

IMPORTANT RULES:
1. If the text does NOT contain any food items or is unclear, respond with: {"error": "No food items detected. Please enter a valid meal."}
2. CRITICAL: ALWAYS preserve the EXACT quantities mentioned in the text (e.g., "200g black beans" → "200g black beans", NOT "1 black beans")
3. Extract ONLY the essential food name and quantity. REMOVE unnecessary words like:
   - "plate of", "bowl of", "cup of", "piece of", "slice of"
   - "some", "a bit of", "portion of"
   - "with", "and", "plus", "along with"
   - "during", "for", "at", "in"
   - Any descriptive words that aren't part of the food name

4. Examples of correct extraction:
   - "200g of black beans" → extract "200g black beans"
   - "2 slices of bread" → extract "2 bread"
   - "1 bowl of rice with chicken" → extract "1 rice" and "1 chicken"
   - "some apples and a sandwich" → extract "1 apple" and "1 sandwich"
   - "3 pieces of pizza" → extract "3 pizza"

5. CRITICAL: ALWAYS preserve EXACT quantities and units mentioned:
   - "200 grams of black beans" → "200g black beans" (NOT "1 black beans")
   - "150g chicken" → "150g chicken" (NOT "1 chicken")
   - "1 cup rice" → "1 cup rice" (NOT "1 rice")
   - "2 slices bread" → "2 bread" (NOT "1 bread")
   - "500ml juice" → "500ml juice" (NOT "1 juice")

6. If no specific quantity is mentioned, assume quantity of 1 (e.g., "1 sandwich", "1 rice")
7. Convert words to numbers: "one" → "1", "two" → "2", "three" → "3", etc.
8. Convert units: "grams" → "g", "milliliters" → "ml", "cups" → "cup", "slices" → "slice"
9. Use CONSISTENT calorie values for similar foods:
   - "omelette", "mini omelette", "egg omelette" → use same calorie value (~90-120 calories per omelette)
   - "bread", "slice of bread", "bread slice" → use same calorie value (~80-100 calories per slice)
   - "apple", "red apple", "green apple" → use same calorie value (~80-100 calories per apple)
   - "rice", "white rice", "cooked rice" → use same calorie value (~200-250 calories per cup)
   - "biryani", "chicken biryani", "vegetable biryani" → use same calorie value (~300-400 calories per serving)
   - "black beans", "beans", "kidney beans" → use same calorie value (~120-150 calories per 100g)
9. CRITICAL: Calculate nutrition values based on the ACTUAL quantities mentioned, not standard serving sizes
10. IMPORTANT: Provide realistic fiber values based on the food type:
    - Fruits and vegetables: 2-8g fiber per serving
    - Whole grains and breads: 2-4g fiber per serving  
    - Legumes and beans: 5-15g fiber per serving
    - Nuts and seeds: 2-6g fiber per serving
    - Processed foods: 0-2g fiber per serving

The JSON object must have this structure: 
{ "transcription": "The meal text you analyzed", "items": [ { "name": "quantity + food item", "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number> } ], "total": { "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number> } }`;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          let text = response.text();
          console.log("PhotoCalorieScreen - Re-analysis raw response:", text);

          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonString = jsonMatch[0];
            const data = JSON.parse(jsonString);

            // Check for error response
            if (data.error) {
              throw new Error(data.error);
            }

            if (!data.total || !Array.isArray(data.items) || !data.transcription) {
              throw new Error("Invalid JSON structure from API.");
            }

            // Convert voice analysis format to photo analysis format
            const newAnalysis = {
              dish_name: editedFoodName,
              ingredients: data.items.map(item => ({
                name: item.name,
                quantity: item.name, // Use name as quantity since it contains quantity
              })),
              total_nutrition: {
                calories: data.total.calories,
                protein: data.total.protein,
                carbs: data.total.carbs,
                fat: data.total.fat,
                fiber: data.total.fiber || 0,
                micronutrients: analysis?.total_nutrition?.micronutrients || {},
              },
              confidence_level: analysis?.confidence_level || 85,
            };

            setCurrentAnalysis(newAnalysis);
            setAnalysis(newAnalysis);
            
            // Update macros
            setMacros({
              protein: data.total.protein || 0,
              carbs: data.total.carbs || 0,
              fat: data.total.fat || 0,
              fiber: data.total.fiber || 0,
            });

            setIsEditing(false);
            Alert.alert('Success', 'Food re-analyzed successfully!');
            return;
          } else {
            throw new Error('Invalid JSON format from API.');
          }
        } catch (error) {
          lastError = error;
          console.log(`Model ${modelName} failed:`, error.message);
        }
      }

      throw lastError || new Error('All AI models are currently unavailable.');
    } catch (error) {
      console.error('PhotoCalorieScreen - Re-analysis error:', error);
      Alert.alert('Error', error.message || 'Failed to re-analyze food. Please try again.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleRetakePhoto = () => {
    navigation.goBack();
  };

  const handleErrorRetry = () => {
    setShowErrorModal(false);
    navigation.goBack();
  };

  if (showErrorModal) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.errorContainer}>
          <Ionicons name="camera-outline" size={80} color="#ccc" />
          <Text style={styles.errorTitle}>No Food Detected</Text>
          <Text style={styles.errorMessage}>
            We couldn&apos;t identify any food in this image. Please try taking another photo with:
          </Text>
          <View style={styles.errorTips}>
            <Text style={styles.errorTip}>• Good lighting</Text>
            <Text style={styles.errorTip}>• Food clearly visible</Text>
            <Text style={styles.errorTip}>• Camera focused on the food</Text>
          </View>
          <TouchableOpacity style={styles.retryButton} onPress={handleErrorRetry}>
            <Text style={styles.retryButtonText}>Take Another Photo</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size={50} color="#7B61FF" />
          <Text style={styles.loadingText}>Analyzing your food...</Text>
          <Text style={styles.loadingSubtext}>This may take a few seconds</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!analysis) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={80} color="#ff4757" />
          <Text style={styles.errorTitle}>Analysis Failed</Text>
          <Text style={styles.errorMessage}>
            We couldn&apos;t analyze this image. Please try taking another photo.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetakePhoto}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Food Analysis</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom >= 20 ? (insets.bottom + 20) : 20 }}
      >
        {/* Photo */}
        <View style={styles.photoContainer}>
          <Image 
            source={{ 
              uri: photoUri || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop' 
            }} 
            style={styles.photo} 
          />
          <TouchableOpacity style={styles.retakeButton} onPress={handleRetakePhoto}>
            <Ionicons name="camera-outline" size={20} color="#7B61FF" />
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
        </View>

        {/* Food Name */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Identified Food</Text>
            <View style={styles.editActions}>
              {isEditing ? (
                <>
                  <TouchableOpacity 
                    onPress={handleReanalyzeFood}
                    disabled={isReanalyzing}
                    style={styles.tickButton}
                  >
                    {isReanalyzing ? (
                      <ActivityIndicator size="small" color="#7B61FF" />
                    ) : (
                      <Ionicons name="checkmark-circle" size={24} color="#7B61FF" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setIsEditing(false)}
                    style={styles.cancelEditButton}
                  >
                    <Ionicons name="close-circle-outline" size={24} color="#666" />
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => setIsEditing(true)}>
                  <Ionicons name="pencil-outline" size={20} color="#7B61FF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {isEditing ? (
            <TextInput
              style={[styles.foodName, styles.editableText]}
              value={editedFoodName}
              onChangeText={setEditedFoodName}
              placeholder="Enter food name"
              autoFocus
            />
          ) : (
            <Text style={styles.foodName}>{editedFoodName || (currentAnalysis || analysis)?.dish_name}</Text>
          )}
          <Text style={styles.confidence}>
            Confidence: {(currentAnalysis || analysis)?.confidence_level || 85}%
          </Text>
        </View>

        {/* Nutrition Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrition Summary</Text>
          <View style={styles.nutritionGrid}>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{(currentAnalysis || analysis)?.total_nutrition?.calories || 0}</Text>
              <Text style={styles.nutritionLabel}>Calories</Text>
            </View>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{macros.protein}g</Text>
              <Text style={styles.nutritionLabel}>Protein</Text>
            </View>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{macros.carbs}g</Text>
              <Text style={styles.nutritionLabel}>Carbs</Text>
            </View>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{macros.fat}g</Text>
              <Text style={styles.nutritionLabel}>Fat</Text>
            </View>
          </View>
        </View>

        {/* Ingredients */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients Detected</Text>
          {((currentAnalysis || analysis)?.ingredients && (currentAnalysis || analysis).ingredients.length > 0) && (currentAnalysis || analysis).ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientItem}>
              <View style={styles.ingredientDot} />
              <View style={styles.ingredientInfo}>
                <Text style={styles.ingredientName}>{ingredient.name}</Text>
                <Text style={styles.ingredientQuantity}>{ingredient.quantity}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Mood Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How are you feeling?</Text>
          <View style={styles.moodGrid}>
            {moodOptions.map((mood, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.moodOption,
                  selectedMood === index && styles.selectedMood
                ]}
                onPress={() => setSelectedMood(selectedMood === index ? null : index)}
              >
                <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                <Text style={styles.moodLabel}>{mood.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={[styles.actionContainer, { paddingBottom: insets.bottom >= 20 ? (insets.bottom + 20) : 20 }]}>
        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSaveToSavedMeals}
        >
          <Ionicons name="bookmark-outline" size={20} color="#7B61FF" />
          <Text style={styles.saveButtonText}>Save Meal</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.confirmButton} 
          onPress={handleConfirm}
        >
          <Text style={styles.confirmButtonText}>Log Food</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border : '#f0f0f0',
    backgroundColor: colors.cardBackground,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  photoContainer: {
    position: 'relative',
    margin: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  retakeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  retakeText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  foodName: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  editableText: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 5,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tickButton: {
    padding: 4,
  },
  cancelEditButton: {
    padding: 4,
  },
  confidence: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
    borderRadius: 12,
    padding: 16,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  nutritionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  ingredientQuantity: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moodOption: {
    width: '30%',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
  },
  selectedMood: {
    backgroundColor: isDark ? 'rgba(123, 97, 255, 0.25)' : '#E8E4FF',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionContainer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: isDark ? colors.border : '#f0f0f0',
    backgroundColor: colors.cardBackground,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 16,
    marginRight: 12,
  },
  saveButtonText: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  confirmButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 20,
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  errorTips: {
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  errorTip: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  editSection: {
    marginBottom: 20,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.cardBackground,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  macroItem: {
    width: '48%',
    marginBottom: 16,
  },
  macroInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.cardBackground,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveEditButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveEditButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default PhotoCalorieScreen;
