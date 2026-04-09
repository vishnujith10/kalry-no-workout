import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useContext, useEffect, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingContext } from '../context/OnboardingContext';
import { useTheme } from '../context/ThemeContext';

const LIGHT_BG = '#F8F9FE';
const CARD_BG = '#FFFFFF';
const PRIMARY_PURPLE = '#A182F9';
const SUCCESS_GREEN = '#10B981';
const ENERGY_ORANGE = '#F97316';
const WARNING_YELLOW = '#F59E0B';
const TEXT_PRIMARY = '#1A1D2E';
const TEXT_SECONDARY = '#6B7280';

const genders = ['Male', 'Female'];

const MiniProfileScreen = () => {
  const navigation = useNavigation();
  const { setOnboardingData } = useContext(OnboardingContext);
  const { colors, isDark } = useTheme();
  const [selectedGender, setSelectedGender] = useState('Male');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [isMetric, setIsMetric] = useState(true);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const scrollViewRef = React.useRef(null);
  const heightInputRef = React.useRef(null);
  const weightInputRef = React.useRef(null);
  const genderRowRef = React.useRef(null);
  const unitToggleRef = React.useRef(null);
  const [genderRowWidth, setGenderRowWidth] = useState(0);
  const [unitToggleWidth, setUnitToggleWidth] = useState(0);
  
  // Animated values for sliding backgrounds
  const genderSlideAnim = React.useRef(new Animated.Value(selectedGender === 'Male' ? 0 : 1)).current;
  const unitSlideAnim = React.useRef(new Animated.Value(isMetric ? 0 : 1)).current;
  
  // Measure container widths for sliding animation
  const measureGenderRow = (event) => {
    const { width } = event.nativeEvent.layout;
    setGenderRowWidth(width);
  };
  
  const measureUnitToggle = (event) => {
    const { width } = event.nativeEvent.layout;
    setUnitToggleWidth(width);
  };
  
  // Animate gender selection
  useEffect(() => {
    Animated.timing(genderSlideAnim, {
      toValue: selectedGender === 'Male' ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [selectedGender]);
  
  // Animate unit toggle
  useEffect(() => {
    Animated.timing(unitSlideAnim, {
      toValue: isMetric ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isMetric]);

  // ✅ Disable back gesture during Google onboarding
  useFocusEffect(
    React.useCallback(() => {
      // Check if this is Google user onboarding
      if (global.googleUserData) {
        console.log('✅ Google onboarding detected - Disabling back gesture');
        navigation.getParent()?.setOptions({
          gestureEnabled: false, // Disable swipe back
        });
      }
      
      return () => {
        // Re-enable when leaving
        navigation.getParent()?.setOptions({
          gestureEnabled: true,
        });
      };
    }, [navigation])
  );

  // ✅ Load Google user data
  useEffect(() => {
    if (global.googleUserData) {
      console.log('✅ Loading Google user data:', global.googleUserData.email);
      
      const fullName = global.googleUserData.user_metadata?.full_name || 'User';
      const firstName = fullName.split(' ')[0];
      setName(firstName);
      
      setIsGoogleUser(true);
    }
  }, []);

  const handleHeightCmChange = (val) => {
    setHeightCm(val);
    if (val && !isNaN(Number(val))) {
      setHeightFt((Number(val) / 30.48).toFixed(2));
    } else {
      setHeightFt('');
    }
  };

  const handleHeightFtChange = (val) => {
    setHeightFt(val);
    if (val && !isNaN(Number(val))) {
      setHeightCm((Number(val) * 30.48).toFixed(0));
    } else {
      setHeightCm('');
    }
  };

  const handleWeightKgChange = (val) => {
    setWeightKg(val);
    if (val && !isNaN(Number(val))) {
      setWeightLbs((Number(val) * 2.20462).toFixed(1));
    } else {
      setWeightLbs('');
    }
  };

  const handleWeightLbsChange = (val) => {
    setWeightLbs(val);
    if (val && !isNaN(Number(val))) {
      setWeightKg((Number(val) / 2.20462).toFixed(1));
    } else {
      setWeightKg('');
    }
  };

  const minHeightCm = 100;
  const minHeightFt = 3.3;
  const minWeightKg = 30;
  const minWeightLbs = 66;

  const allFieldsFilled =
    name.trim().length > 0 &&
    age.trim().length > 0 &&
    selectedGender.trim().length > 0 &&
    heightCm.trim().length > 0 &&
    heightFt.trim().length > 0 &&
    weightKg.trim().length > 0 &&
    weightLbs.trim().length > 0 &&
    !isNaN(Number(age)) &&
    !isNaN(Number(heightCm)) &&
    !isNaN(Number(heightFt)) &&
    !isNaN(Number(weightKg)) &&
    !isNaN(Number(weightLbs));

  const validHeight =
    Number(heightCm) >= minHeightCm && Number(heightFt) >= minHeightFt;
  const validWeight =
    Number(weightKg) >= minWeightKg && Number(weightLbs) >= minWeightLbs;

  const canShowBMI = allFieldsFilled && validHeight && validWeight;
  const canContinue = canShowBMI;

  let bmi = '';
  let bmiStatus = '';
  let bmiColor = '';
  let bmiGradient = [];

  if (canShowBMI) {
    const h = Number(heightCm) / 100;
    const w = Number(weightKg);
    if (h > 0) {
      bmi = (w / (h * h)).toFixed(1);
      const bmiNum = Number(bmi);
      if (bmiNum < 18.5) {
        bmiStatus = 'Underweight';
        bmiColor = ENERGY_ORANGE;
        bmiGradient = ['#FEE2E2', '#FECACA'];
      } else if (bmiNum >= 18.5 && bmiNum < 25) {
        bmiStatus = 'Healthy';
        bmiColor = SUCCESS_GREEN;
        bmiGradient = ['#D1FAE5', '#A7F3D0'];
      } else if (bmiNum >= 25 && bmiNum < 30) {
        bmiStatus = 'Overweight';
        bmiColor = WARNING_YELLOW;
        bmiGradient = ['#FEF3C7', '#FDE68A'];
      } else {
        bmiStatus = 'Obese';
        bmiColor = ENERGY_ORANGE;
        bmiGradient = ['#FEE2E2', '#FECACA'];
      }
    }
  }

  const handleContinue = async () => {
    setOnboardingData({
      name,
      age,
      gender: selectedGender,
      heightCm,
      heightFt,
      weightKg,
      weightLbs,
      isMetric,
      bmi,
      googleId: isGoogleUser ? global.googleUserData?.id : null,
      googleEmail: isGoogleUser ? global.googleUserData?.email : null,
    });

    try {
      await AsyncStorage.setItem('kalry_onboarding_weight', isMetric ? weightKg : weightLbs);
      await AsyncStorage.setItem('kalry_onboarding_height', isMetric ? heightCm : heightFt);
      await AsyncStorage.setItem('kalry_onboarding_unit', isMetric ? 'kg' : 'lbs');
    } catch (e) {
      console.warn('Failed to save onboarding weight/height to storage', e);
    }

    // Navigate based on user type
    if (isGoogleUser) {
      navigation.navigate('ActivityLevel');
    } else {
      navigation.navigate('ReferralSource');
    }
  };

  // Handle focus on height/weight inputs to scroll to them
  const handleHeightFocus = () => {
    // Wait for keyboard to open, then scroll to end to show inputs and continue button
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 300);
  };

  const handleWeightFocus = () => {
    // Wait for keyboard to open, then scroll to end to show inputs and continue button
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 300);
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? 3 : 0,
    },
    heading: {
      fontSize: 20,
      fontFamily: 'Lexend-Bold',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
      fontFamily: 'Manrope-Regular',
    },
    inputCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 4,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    input: {
      flex: 1,
      height: 48,
      fontSize: 16,
      color: colors.textPrimary,
      fontFamily: 'Manrope-Regular',
      marginLeft: 12,
    },
    measurementCard: {
      flex: 1,
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 6,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    measurementLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      fontFamily: 'Manrope-Regular',
    },
    measurementInput: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      fontFamily: 'Lexend-Bold',
      flex: 1,
    },
    measurementUnit: {
      fontSize: 16,
      color: colors.textSecondary,
      fontFamily: 'Manrope-Regular',
      marginLeft: 8,
    },
    googleWelcomeText: {
      fontSize: 14,
      color: colors.textPrimary,
      fontFamily: 'Manrope-Regular',
      marginLeft: 8,
    },
  });

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <StatusBar style={isDark ? 'light' : 'auto'} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.headerRow}>
          {/* ✅ Hide back button for Google users */}
          {!isGoogleUser && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <View style={styles.backButtonCircle}>
                <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
              </View>
            </TouchableOpacity>
          )}
          {isGoogleUser && <View style={{ width: 44 }} />}
          
          <Text style={dynamicStyles.heading}>Personal Setup</Text>
          <View style={{ width: 44 }} />
        </View>

        {isGoogleUser && (
          <View style={styles.googleWelcomeContainer}>
            <View style={styles.googleWelcomeCard}>
              <MaterialCommunityIcons name="google" size={20} color={PRIMARY_PURPLE} />
              <Text style={dynamicStyles.googleWelcomeText}>
                Welcome! Let&apos;s complete your profile
              </Text>
            </View>
          </View>
        )}

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        >
        <View style={styles.formWrap}>
          <View style={styles.inputGroup}>
            <Text style={dynamicStyles.label}>Name</Text>
            <View style={dynamicStyles.inputCard}>
              <MaterialCommunityIcons name="account" size={20} color={colors.textSecondary} />
              <TextInput
                style={dynamicStyles.input}
                placeholder="Enter your name"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={dynamicStyles.label}>Age</Text>
            <View style={dynamicStyles.inputCard}>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.textSecondary} />
              <TextInput
                style={dynamicStyles.input}
                placeholder="Enter your age"
                placeholderTextColor={colors.textSecondary}
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={dynamicStyles.label}>Gender</Text>
            <View 
              ref={genderRowRef}
              style={styles.genderRow}
              onLayout={measureGenderRow}
            >
              {/* Animated sliding background */}
              {genderRowWidth > 0 && (
                <Animated.View
                  style={[
                    styles.genderSlideBackground,
                    {
                      width: (genderRowWidth - 8 - 12) / 2, // Container width - padding(8) - gap(12), divided by 2
                      transform: [{
                        translateX: genderSlideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, (genderRowWidth - 8 - 12) / 2 + 12], // Slide to second button position
                        }),
                      }],
                    },
                  ]}
                />
              )}
              {genders.map((gender, index) => (
                <TouchableOpacity
                  key={gender}
                  style={styles.genderButton}
                  onPress={() => setSelectedGender(gender)}
                  activeOpacity={0.7}
                >
                  <View style={styles.genderContent}>
                    <MaterialCommunityIcons 
                      name={gender === 'Male' ? 'gender-male' : 'gender-female'} 
                      size={20} 
                      color={selectedGender === gender ? "#FFFFFF" : colors.textSecondary} 
                    />
                    <Text style={selectedGender === gender ? styles.genderTextSelected : styles.genderText}>
                      {gender}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View 
            ref={unitToggleRef}
            style={styles.unitToggleContainer}
            onLayout={measureUnitToggle}
          >
            {/* Animated sliding background */}
            {unitToggleWidth > 0 && (
              <Animated.View
                style={[
                  styles.unitSlideBackground,
                  {
                    width: (unitToggleWidth - 8) / 2, // Container width - padding, divided by 2
                    transform: [{
                      translateX: unitSlideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, (unitToggleWidth - 8) / 2], // Slide to second button position
                      }),
                    }],
                  },
                ]}
              />
            )}
            <TouchableOpacity
              style={styles.unitToggle}
              onPress={() => setIsMetric(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.unitToggleText, isMetric && styles.unitToggleTextActive]}>
                Metric
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.unitToggle}
              onPress={() => setIsMetric(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.unitToggleText, !isMetric && styles.unitToggleTextActive]}>
                Imperial
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.measurementsRow}>
            <View style={dynamicStyles.measurementCard}>
              <Text style={dynamicStyles.measurementLabel}>Height</Text>
              <View style={styles.measurementInputWrapper}>
                <TextInput
                  ref={heightInputRef}
                  style={dynamicStyles.measurementInput}
                  placeholder={isMetric ? "170" : "5.6"}
                  placeholderTextColor={colors.textSecondary}
                  value={isMetric ? heightCm : heightFt}
                  onChangeText={isMetric ? handleHeightCmChange : handleHeightFtChange}
                  onFocus={handleHeightFocus}
                  keyboardType="numeric"
                />
                <Text style={dynamicStyles.measurementUnit}>{isMetric ? 'cm' : 'ft'}</Text>
              </View>
            </View>

            <View style={dynamicStyles.measurementCard}>
              <Text style={dynamicStyles.measurementLabel}>Weight</Text>
              <View style={styles.measurementInputWrapper}>
                <TextInput
                  ref={weightInputRef}
                  style={dynamicStyles.measurementInput}
                  placeholder={isMetric ? "70" : "154"}
                  placeholderTextColor={colors.textSecondary}
                  value={isMetric ? weightKg : weightLbs}
                  onChangeText={isMetric ? handleWeightKgChange : handleWeightLbsChange}
                  onFocus={handleWeightFocus}
                  keyboardType="numeric"
                />
                <Text style={dynamicStyles.measurementUnit}>{isMetric ? 'kg' : 'lbs'}</Text>
              </View>
            </View>
          </View>

          {canShowBMI && (
            <View style={styles.bmiCard}>
              <LinearGradient
                colors={bmiGradient}
                style={styles.bmiGradient}
              >
                <View style={styles.bmiContent}>
                  <MaterialCommunityIcons name="heart-pulse" size={24} color={bmiColor} />
                  <View style={styles.bmiTextContent}>
                    <Text style={styles.bmiLabel}>Your BMI</Text>
                    <View style={styles.bmiValueRow}>
                      <Text style={[styles.bmiValue, { color: bmiColor }]}>{bmi}</Text>
                      <Text style={[styles.bmiStatus, { color: bmiColor }]}>• {bmiStatus}</Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </View>
          )}
        </View>
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.ctaButton, !canContinue && styles.ctaButtonDisabled]}
            disabled={!canContinue}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            {canContinue ? (
              <View style={styles.buttonActive}>
                <Text style={styles.buttonText}>Continue</Text>
                <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
              </View>
            ) : (
              <View style={styles.buttonDisabled}>
                <Text style={styles.buttonTextDisabled}>Complete all fields</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 20,
  },
  backButton: {
    zIndex: 10,
  },
  backButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  googleWelcomeContainer: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  googleWelcomeCard: {
    flexDirection: 'row',
    backgroundColor: '#F3EFFF', // Light purple background to match theme
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_PURPLE,
  },
  googleWelcomeText: {
    fontSize: 14,
    fontFamily: 'Manrope-Regular',
    color: TEXT_PRIMARY,
    fontWeight: '500',
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 200, // Extra padding to ensure inputs and button are visible above keyboard
  },
  formWrap: {
    paddingHorizontal: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Manrope-Regular',
    color: TEXT_PRIMARY,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Manrope-Regular',
    color: TEXT_PRIMARY,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  genderSlideBackground: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: PRIMARY_PURPLE,
    borderRadius: 12,
    zIndex: 0,
  },
  genderButton: {
    flex: 1,
    zIndex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  genderText: {
    fontSize: 15,
    fontFamily: 'Manrope-Regular',
    color: TEXT_SECONDARY,
    fontWeight: '600',
  },
  genderTextSelected: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
    color: '#FFFFFF',
  },
  unitToggleContainer: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  unitSlideBackground: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: '#F3EFFF',
    borderRadius: 12,
    zIndex: 0,
  },
  unitToggle: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    zIndex: 1,
  },
  unitToggleText: {
    fontSize: 14,
    fontFamily: 'Manrope-Regular',
    color: TEXT_SECONDARY,
    fontWeight: '600',
  },
  unitToggleTextActive: {
    color: PRIMARY_PURPLE,
    fontFamily: 'Lexend-Bold',
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  measurementCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  measurementLabel: {
    fontSize: 13,
    fontFamily: 'Manrope-Regular',
    color: TEXT_SECONDARY,
    fontWeight: '500',
    marginBottom: 12,
  },
  measurementInputWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  measurementInput: {
    fontSize: 28,
    fontFamily: 'Lexend-Bold',
    color: TEXT_PRIMARY,
    flex: 1,
    padding: 0,
  },
  measurementUnit: {
    fontSize: 16,
    fontFamily: 'Manrope-Regular',
    color: TEXT_SECONDARY,
    fontWeight: '600',
  },
  bmiCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  bmiGradient: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  bmiContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bmiTextContent: {
    flex: 1,
  },
  bmiLabel: {
    fontSize: 13,
    fontFamily: 'Manrope-Regular',
    color: TEXT_SECONDARY,
    fontWeight: '500',
    marginBottom: 6,
  },
  bmiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bmiValue: {
    fontSize: 24,
    fontFamily: 'Lexend-Bold',
    fontWeight: '700',
  },
  bmiStatus: {
    fontSize: 16,
    fontFamily: 'Manrope-Regular',
    fontWeight: '600',
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: LIGHT_BG,
    width: '100%',
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
    backgroundColor: PRIMARY_PURPLE,
    borderRadius: 16,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Lexend-Bold',
    letterSpacing: 0.3,
  },
  ctaButtonDisabled: {
    opacity: 1,
  },
  buttonDisabled: {
    backgroundColor: '#E5E7EB',
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: 16,
  },
  buttonTextDisabled: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
  },
});

export default MiniProfileScreen;
