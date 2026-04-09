import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useContext, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingContext } from '../context/OnboardingContext';
import { useTheme } from '../context/ThemeContext';

// Modern Fitness Light Mode Palette
const LIGHT_BG = '#F8F9FE';
const CARD_BG = '#FFFFFF';
const TEXT_PRIMARY = '#1A1D2E';
const TEXT_SECONDARY = '#6B7280';
const PRIMARY_PURPLE = '#A182F9';
const VIBRANT_PURPLE = '#7C3AED';

const options = [
  { label: '10–20 mins', icon: 'timer', gradient: ['#FEE2E2', '#FECACA'] },
  { label: '20–40 mins', icon: 'schedule', gradient: ['#FEF3C7', '#FDE68A'] },
  { label: '40–60 mins', icon: 'access-time', gradient: ['#D1FAE5', '#A7F3D0'] },
  { label: '60+ mins', icon: 'timer', gradient: ['#DBEAFE', '#BFDBFE'] },
  { label: 'It varies', icon: 'shuffle', gradient: ['#F3E8FF', '#E9D5FF'] },
];

const TimePerDayScreen = ({ navigation }) => {
  const { onboardingData, setOnboardingData } = useContext(OnboardingContext);
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState(null);

  const handleNext = (spendingTime) => {
    setOnboardingData({
      ...onboardingData,
      spending_time: spendingTime,
    });
    navigation.navigate('WorkoutPreferences');
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    subtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: 'Manrope-Regular',
      letterSpacing: 2,
      fontWeight: '600',
      marginBottom: 6,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      fontFamily: 'Lexend-Bold',
      letterSpacing: -0.5,
      marginBottom: 8,
      lineHeight: 34,
    },
    description: {
      fontSize: 16,
      color: colors.textSecondary,
      fontFamily: 'Manrope-Regular',
      lineHeight: 24,
      marginBottom: 32,
    },
    optionCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 20,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    optionText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      fontFamily: 'Manrope-Regular',
    },
  });

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <StatusBar style={isDark ? 'light' : 'auto'} />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <View style={styles.backButtonCircle}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </View>
        </TouchableOpacity>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false} 
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentWrapper}>
          <View style={styles.header}>
            <Text style={dynamicStyles.subtitle}>DAILY COMMITMENT</Text>
            <Text style={dynamicStyles.title}>How much time{'\n'}can you give?</Text>
            <Text style={dynamicStyles.description}>
              Choose a time range that fits your schedule
            </Text>
          </View>

          <View style={styles.optionsWrapper}>
            {options.map((option, idx) => (
              <TouchableOpacity
                key={option.label}
                style={[
                  dynamicStyles.optionCard,
                  selected === idx && styles.optionCardSelected
                ]}
                onPress={() => setSelected(idx)}
                activeOpacity={0.7}
              >
                <View style={styles.optionContent}>
                  <LinearGradient
                    colors={option.gradient}
                    style={styles.iconWrapperGradient}
                  >
                    <MaterialIcons 
                      name={option.icon} 
                      size={24} 
                      color={colors.textPrimary} 
                    />
                  </LinearGradient>
                  <Text style={dynamicStyles.optionText}>
                    {option.label}
                  </Text>
                  {selected === idx ? (
                    <View style={styles.checkCircle}>
                      <MaterialIcons name="check" size={16} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.emptyCircle} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="lightbulb-on" size={20} color={VIBRANT_PURPLE} />
            <Text style={styles.infoText}>
              Consistency matters more than duration. Start where you are!
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.ctaButton, selected === null && styles.ctaButtonDisabled]}
          disabled={selected === null}
          onPress={() => handleNext(options[selected].label)}
          activeOpacity={0.85}
        >
          {selected !== null ? (
            <View style={styles.buttonActive}>
              <Text style={styles.buttonText}>Continue</Text>
              <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
            </View>
          ) : (
            <View style={styles.buttonDisabled}>
              <Text style={styles.buttonTextDisabled}>Select your time commitment</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 32,
  },
  subtitle: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    fontFamily: 'Lexend-Bold',
    letterSpacing: -0.5,
    marginBottom: 8,
    lineHeight: 38,
  },
  description: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
    lineHeight: 24,
  },
  optionsWrapper: {
    marginBottom: 20,
    gap: 12,
  },
  optionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: PRIMARY_PURPLE,
    shadowColor: PRIMARY_PURPLE,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperGradient: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    fontFamily: 'Manrope-Regular',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_PRIMARY,
    fontFamily: 'Manrope-Regular',
    fontWeight: '500',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: LIGHT_BG,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
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

export default TimePerDayScreen;