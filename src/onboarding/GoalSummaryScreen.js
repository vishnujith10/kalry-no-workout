import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useContext } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingContext } from '../context/OnboardingContext';
import { useTheme } from '../context/ThemeContext';

const LIGHT_BG = '#F8F9FE';
const CARD_BG = '#FFFFFF';
const PRIMARY_PURPLE = '#A182F9';
const VIBRANT_PURPLE = '#7C3AED';
const SUCCESS_GREEN = '#10B981';
const ENERGY_ORANGE = '#F97316';
const TEXT_PRIMARY = '#1A1D2E';
const TEXT_SECONDARY = '#6B7280';

const GoalSummaryScreen = ({ navigation }) => {
  const { onboardingData } = useContext(OnboardingContext);
  const { colors, isDark } = useTheme();

  const {
    goal_focus = 'Lose',
    target_weight = 0,
    weight = 0,
    selectedWeightUnit = 'kg',
    weekly_target = 0.5,
    total_days_per_week = 'N/A',
  } = onboardingData;

  const currentWeight = Number(weight);
  const targetWeight = Number(target_weight);
  const weeklyTarget = Number(weekly_target);
  const isLbs = selectedWeightUnit === 'lbs';

  let goalText = '';
  let weightDiff = Math.abs(targetWeight - currentWeight);
  let displayWeightDiff = weightDiff;
  const convertedWeeklyTarget = isLbs ? (weeklyTarget * 2.20462) : weeklyTarget;
  
  if (selectedWeightUnit === 'lbs') {
    displayWeightDiff = (weightDiff * 2.20462).toFixed(1);
  } else {
    displayWeightDiff = weightDiff.toFixed(1);
  }

  if (goal_focus.toLowerCase().includes('gain')) {
    goalText = `Gain ${displayWeightDiff} ${selectedWeightUnit}`;
  } else if (goal_focus.toLowerCase().includes('lose')) {
    goalText = `Lose ${displayWeightDiff} ${selectedWeightUnit}`;
  } else {
    goalText = 'Maintain current weight';
  }
  
  const estimatedWeeks = (weeklyTarget > 0 && weightDiff > 0)
    ? Math.ceil(weightDiff / weeklyTarget)
    : 'N/A';
  
  const estimatedTime = estimatedWeeks !== 'N/A' ? `~${estimatedWeeks} weeks` : 'N/A';

  const goalProgress = 0;

  const handleFinishOnboarding = () => {
    navigation.replace('Signup');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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
      >
        <View style={styles.contentWrapper}>
          <View style={styles.header}>
            <Text style={styles.subtitle}>YOUR JOURNEY</Text>
            <Text style={styles.title}>Goal Overview</Text>
          </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={[PRIMARY_PURPLE, PRIMARY_PURPLE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.iconRing}>
              <MaterialCommunityIcons name="target" size={40} color="#FFFFFF" />
            </View>
            <Text style={styles.goalText}>{goalText}</Text>
            
            <View style={styles.progressWrapper}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${goalProgress * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>Your journey starts now</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <LinearGradient
              colors={['#EEF2FF', '#E0E7FF']}
              style={styles.statIconBox}
            >
              <MaterialCommunityIcons name="scale-bathroom" size={26} color={PRIMARY_PURPLE} />
            </LinearGradient>
            <Text style={styles.statValue}>{displayWeightDiff}</Text>
            <Text style={styles.statLabel}>{selectedWeightUnit} to go</Text>
          </View>

          <View style={styles.statCard}>
            <LinearGradient
              colors={['#F3E8FF', '#E9D5FF']}
              style={styles.statIconBox}
            >
              <MaterialIcons name="schedule" size={26} color={VIBRANT_PURPLE} />
            </LinearGradient>
            <Text style={styles.statValue}>{estimatedTime}</Text>
            <Text style={styles.statLabel}>Timeline</Text>
          </View>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricLeft}>
            <LinearGradient
              colors={['#DBEAFE', '#BFDBFE']}
              style={styles.metricIcon}
            >
              <MaterialCommunityIcons name="heart-pulse" size={22} color={PRIMARY_PURPLE} />
            </LinearGradient>
            <View style={styles.metricInfo}>
              <Text style={styles.metricTitle}>Weekly Target</Text>
              <Text style={styles.metricValue}>{convertedWeeklyTarget.toFixed(1)} {selectedWeightUnit}/week</Text>
            </View>
          </View>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: SUCCESS_GREEN }]} />
            <Text style={styles.statusText}>Active</Text>
          </View>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricLeft}>
            <LinearGradient
              colors={['#FEE2E2', '#FECACA']}
              style={styles.metricIcon}
            >
              <MaterialCommunityIcons name="dumbbell" size={22} color={ENERGY_ORANGE} />
            </LinearGradient>
            <View style={styles.metricInfo}>
              <Text style={styles.metricTitle}>Workout Days</Text>
              <Text style={styles.metricValue}>{total_days_per_week} days/week</Text>
            </View>
          </View>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: ENERGY_ORANGE }]} />
            <Text style={styles.statusText}>Ready</Text>
          </View>
        </View>

        <View style={styles.insightCard}>
          <LinearGradient
            colors={['rgba(124, 58, 237, 0.05)', 'rgba(236, 72, 153, 0.05)']}
            style={styles.insightGradient}
          >
            <MaterialCommunityIcons name="lightbulb-on" size={24} color={PRIMARY_PURPLE} />
            <Text style={styles.insightText}>
              Consistency beats intensity. Small daily actions lead to massive results.
            </Text>
          </LinearGradient>
        </View>

        <TouchableOpacity 
          style={styles.ctaButton}
          onPress={handleFinishOnboarding}
          activeOpacity={0.85}
        >
          <View style={styles.buttonActive}>
            <Text style={styles.buttonText}>Start Your Journey</Text>
            <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Track • Progress • Achieve</Text>
          </View>
        </View>
      </ScrollView>
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
    marginBottom: 24,
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
    fontSize: 28,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    fontFamily: 'Lexend-Bold',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: PRIMARY_PURPLE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  heroGradient: {
    padding: 24,
    alignItems: 'center',
  },
  iconRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  goalText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  progressWrapper: {
    width: '100%',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'Manrope-Regular',
    textAlign: 'center',
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    fontFamily: 'Lexend-Bold',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
    fontWeight: '500',
  },
  metricCard: {
    marginBottom: 12,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  metricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  metricInfo: {
    flex: 1,
  },
  metricTitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
    marginBottom: 4,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    fontFamily: 'Lexend-Bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
    fontWeight: '600',
  },
  insightCard: {
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  insightGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: TEXT_PRIMARY,
    fontFamily: 'Manrope-Regular',
    fontWeight: '500',
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: PRIMARY_PURPLE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
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
  footer: {
    marginTop: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontFamily: 'Manrope-Regular',
    letterSpacing: 2,
    fontWeight: '600',
  },
});

export default GoalSummaryScreen;