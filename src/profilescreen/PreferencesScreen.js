import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import supabase from '../lib/supabase';

const PreferencesScreen = () => {
  const navigation = useNavigation();
  const { theme, updateTheme, colors, isDark } = useTheme();
  
  // State for units
  const [weightUnit, setWeightUnit] = useState('kg');
  const [heightUnit, setHeightUnit] = useState('cm');
  
  // State for meal reminders
  const [breakfastReminder, setBreakfastReminder] = useState(true);
  const [lunchReminder, setLunchReminder] = useState(true);
  const [dinnerReminder, setDinnerReminder] = useState(true);
  
  // State for workout reminders
  const [workoutReminder, setWorkoutReminder] = useState(true);
  
  // State for sleep reminders
  const [sleepReminder, setSleepReminder] = useState(false);
  
  // Animation refs for sliding indicators
  const weightSlideAnim = useRef(new Animated.Value(0)).current;
  const heightSlideAnim = useRef(new Animated.Value(0)).current;
  const themeSlideAnim = useRef(new Animated.Value(0)).current;
  
  // Button widths for sliding calculation
  const [weightButtonWidth, setWeightButtonWidth] = useState(0);
  const [heightButtonWidth, setHeightButtonWidth] = useState(0);
  const [themeButtonWidth, setThemeButtonWidth] = useState(0);
  
  useEffect(() => {
    fetchUserPreferences();
  }, []);

  // Conversion functions
  const convertWeight = (value, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return value;
    if (fromUnit === 'kg' && toUnit === 'lbs') return (value * 2.20462).toFixed(1);
    if (fromUnit === 'lbs' && toUnit === 'kg') return (value / 2.20462).toFixed(1);
    return value;
  };

  const convertHeight = (value, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return value;
    if (fromUnit === 'cm' && toUnit === 'ft') return (value / 30.48).toFixed(1);
    if (fromUnit === 'ft' && toUnit === 'cm') return (value * 30.48).toFixed(1);
    return value;
  };

  const fetchUserPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_profile')
        .select('weight_unit, height_unit')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user preferences:', error);
        return;
      }

      if (data) {
        setWeightUnit(data.weight_unit || 'kg');
        setHeightUnit(data.height_unit || 'cm');
      } else {
        setWeightUnit('kg');
        setHeightUnit('cm');
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
    }
  };

  const saveUnitPreference = async (unitType, value) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updateData = {};
      updateData[unitType] = value;

      const { error } = await supabase
        .from('user_profile')
        .update(updateData)
        .eq('id', user.id);

      if (error) {
        console.error('Error saving unit preference:', error);
        Alert.alert('Error', 'Failed to save preference. Please try again.');
        return;
      }

      console.log(`${unitType} preference saved successfully`);
    } catch (error) {
      console.error('Error saving unit preference:', error);
      Alert.alert('Error', 'Failed to save preference. Please try again.');
    }
  };

  const handleWeightUnitChange = async (unit) => {
    const oldUnit = weightUnit;
    console.log(`Weight unit changing from ${oldUnit} to ${unit}`);
    setWeightUnit(unit);
    saveUnitPreference('weight_unit', unit);
    
    await convertUserWeightValues(oldUnit, unit);
  };

  const handleHeightUnitChange = async (unit) => {
    const oldUnit = heightUnit;
    console.log(`Height unit changing from ${oldUnit} to ${unit}`);
    setHeightUnit(unit);
    saveUnitPreference('height_unit', unit);
    
    await convertUserHeightValues(oldUnit, unit);
  };

  const convertUserWeightValues = async (fromUnit, toUnit) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profile')
        .select('weight, target_weight')
        .eq('id', user.id)
        .single();

      if (profile) {
        const updates = {};
        
        if (profile.weight) {
          const convertedWeight = convertWeight(Number(profile.weight), fromUnit, toUnit);
          console.log(`Converting weight: ${profile.weight} ${fromUnit} → ${convertedWeight} ${toUnit}`);
          updates.weight = convertedWeight;
        }
        
        if (profile.target_weight) {
          const convertedTargetWeight = convertWeight(Number(profile.target_weight), fromUnit, toUnit);
          console.log(`Converting target weight: ${profile.target_weight} ${fromUnit} → ${convertedTargetWeight} ${toUnit}`);
          updates.target_weight = convertedTargetWeight;
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('user_profile')
            .update(updates)
            .eq('id', user.id);
          
          console.log('Weight values converted successfully');
        }

        await convertWeightLogs(fromUnit, toUnit);
      }
    } catch (error) {
      console.error('Error converting weight values:', error);
    }
  };

  const convertUserHeightValues = async (fromUnit, toUnit) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profile')
        .select('height')
        .eq('id', user.id)
        .single();

      if (profile && profile.height) {
        const convertedHeight = convertHeight(Number(profile.height), fromUnit, toUnit);
        console.log(`Converting height: ${profile.height} ${fromUnit} → ${convertedHeight} ${toUnit}`);
        
        await supabase
          .from('user_profile')
          .update({ height: convertedHeight })
          .eq('id', user.id);
        
        console.log('Height value converted successfully');
      }
    } catch (error) {
      console.error('Error converting height values:', error);
    }
  };

  const convertWeightLogs = async (fromUnit, toUnit) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: logs } = await supabase
        .from('weight_logs')
        .select('id, weight')
        .eq('user_id', user.id);

      if (logs && logs.length > 0) {
        for (const log of logs) {
          if (log.weight) {
            const convertedWeight = convertWeight(Number(log.weight), fromUnit, toUnit);
            await supabase
              .from('weight_logs')
              .update({ weight: convertedWeight })
              .eq('id', log.id);
          }
        }
        console.log('Weight logs converted successfully');
      }
    } catch (error) {
      console.error('Error converting weight logs:', error);
    }
  };
  
  // Animate weight unit selection
  useEffect(() => {
    const targetPosition = weightUnit === 'kg' ? 0 : 1;
    
    Animated.spring(weightSlideAnim, {
      toValue: targetPosition,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
      velocity: 2,
    }).start();
  }, [weightUnit, weightSlideAnim]);
  
  // Animate height unit selection
  useEffect(() => {
    const targetPosition = heightUnit === 'cm' ? 0 : 1;
    
    Animated.spring(heightSlideAnim, {
      toValue: targetPosition,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
      velocity: 2,
    }).start();
  }, [heightUnit, heightSlideAnim]);
  
  // Animate theme selection
  useEffect(() => {
    const targetPosition = theme === 'Light' ? 0 : 1;
    
    Animated.spring(themeSlideAnim, {
      toValue: targetPosition,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
      velocity: 2,
    }).start();
  }, [theme, themeSlideAnim]);
  
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 50,
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 10,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    unitSelector: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F5F5',
      borderRadius: 8,
      padding: 4,
      position: 'relative',
    },
    themeSelector: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F5F5',
      borderRadius: 8,
      padding: 4,
      position: 'relative',
    },
    unitButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    unitButtonTextActive: {
      color: '#FFFFFF',
    },
    themeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    themeButtonTextActive: {
      color: '#FFFFFF',
    },
  }), [colors, isDark]);

  return (
    <View style={dynamicStyles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={dynamicStyles.headerTitle}>Preferences</Text>
          <Text style={dynamicStyles.headerSubtitle}>Set your app experience to suit your routine.</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        
        {/* Units Section */}
        <View style={dynamicStyles.card}>
          <Text style={dynamicStyles.cardTitle}>Units</Text>
          
          {/* Weight Units */}
          <View style={styles.settingRow}>
            <Text style={dynamicStyles.settingLabel}>Weight Units</Text>
            <View 
              style={dynamicStyles.unitSelector}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                const calculatedWidth = (width - 8) / 2;
                setWeightButtonWidth(calculatedWidth);
              }}
            >
               {/* Sliding indicator for weight */}
               {weightButtonWidth > 0 && (
                 <Animated.View 
                   style={[
                     styles.slidingIndicator,
                     {
                       width: weightButtonWidth,
                       backgroundColor: colors.primary,
                       shadowColor: colors.primary,
                       transform: [{
                         translateX: weightSlideAnim.interpolate({
                           inputRange: [0, 1],
                           outputRange: [0, weightButtonWidth + 4],
                         })
                       }]
                     }
                   ]} 
                 />
               )}
              
              <TouchableOpacity
                style={styles.unitButton}
                onPress={() => handleWeightUnitChange('kg')}
              >
                <Text style={[dynamicStyles.unitButtonText, weightUnit === 'kg' && dynamicStyles.unitButtonTextActive]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.unitButton}
                onPress={() => handleWeightUnitChange('lbs')}
              >
                <Text style={[dynamicStyles.unitButtonText, weightUnit === 'lbs' && dynamicStyles.unitButtonTextActive]}>lbs</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Height Units */}
          <View style={styles.settingRow}>
            <Text style={dynamicStyles.settingLabel}>Height Units</Text>
            <View 
              style={dynamicStyles.unitSelector}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                const calculatedWidth = (width - 8) / 2;
                setHeightButtonWidth(calculatedWidth);
              }}
            >
               {/* Sliding indicator for height */}
               {heightButtonWidth > 0 && (
                 <Animated.View 
                   style={[
                     styles.slidingIndicator,
                     {
                       width: heightButtonWidth,
                       backgroundColor: colors.primary,
                       shadowColor: colors.primary,
                       transform: [{
                         translateX: heightSlideAnim.interpolate({
                           inputRange: [0, 1],
                           outputRange: [0, heightButtonWidth + 4],
                         })
                       }]
                     }
                   ]} 
                 />
               )}
              
              <TouchableOpacity
                style={styles.unitButton}
                onPress={() => handleHeightUnitChange('cm')}
              >
                <Text style={[dynamicStyles.unitButtonText, heightUnit === 'cm' && dynamicStyles.unitButtonTextActive]}>cm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.unitButton}
                onPress={() => handleHeightUnitChange('ft')}
              >
                <Text style={[dynamicStyles.unitButtonText, heightUnit === 'ft' && dynamicStyles.unitButtonTextActive]}>ft</Text>
              </TouchableOpacity>
            </View>
          </View>
          
        </View>

        {/* Theme & Appearance Section */}
        <View style={dynamicStyles.card}>
          <Text style={dynamicStyles.cardTitle}>Theme & Appearance</Text>
          
          {/* App Theme */}
           <View style={styles.settingRow}>
             <Text style={dynamicStyles.settingLabel}>App Theme</Text>
             <View 
               style={dynamicStyles.themeSelector}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                const calculatedWidth = (width - 8) / 2;
                setThemeButtonWidth(calculatedWidth);
              }}
            >
               {/* Sliding indicator for theme */}
               {themeButtonWidth > 0 && (
                 <Animated.View 
                   style={[
                     styles.themeSlidingIndicator,
                     {
                       width: themeButtonWidth,
                       backgroundColor: colors.primary,
                       shadowColor: colors.primary,
                       transform: [{
                         translateX: themeSlideAnim.interpolate({
                           inputRange: [0, 1],
                           outputRange: [0, themeButtonWidth + 4],
                         })
                       }]
                     }
                   ]} 
                 />
               )}
              
              <TouchableOpacity
                style={styles.themeButton}
                onPress={() => updateTheme('Light')}
              >
                <Text style={[dynamicStyles.themeButtonText, theme === 'Light' && dynamicStyles.themeButtonTextActive]}>Light</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.themeButton}
                onPress={() => updateTheme('Dark')}
              >
                <Text style={[dynamicStyles.themeButtonText, theme === 'Dark' && dynamicStyles.themeButtonTextActive]}>Dark</Text>
              </TouchableOpacity>
            </View>
          </View>
          
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  settingRow: {
    marginBottom: 16,
  },
  slidingIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 0,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    zIndex: 1,
  },
  unitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  unitButtonTextActive: {
    color: '#FFFFFF',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  reminderInfo: {
    flex: 1,
  },
  reminderLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  reminderTime: {
    fontSize: 14,
    color: '#7B61FF',
    fontWeight: '500',
  },
  reminderText: {
    fontSize: 14,
    color: '#666',
  },
  themeSlidingIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 0,
  },
  themeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    zIndex: 1,
  },
  themeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  themeButtonTextActive: {
    color: '#FFFFFF',
  },
});

export default PreferencesScreen;