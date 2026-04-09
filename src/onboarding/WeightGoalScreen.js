import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from 'expo-status-bar';
import React, { useContext, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingContext } from "../context/OnboardingContext";
import { useTheme } from '../context/ThemeContext';
import supabase from "../lib/supabase";

const LIGHT_BG = '#F8F9FE';
const CARD_BG = '#FFFFFF';
const PRIMARY_PURPLE = '#A182F9';
const SUCCESS_GREEN = '#10B981';
const ENERGY_ORANGE = '#F97316';
const TEXT_PRIMARY = '#1A1D2E';
const TEXT_SECONDARY = '#6B7280';

const paceOptions = [0.5, 0.75, 1, 1.5];

const WeightGoalScreen = ({ navigation }) => {
  const { onboardingData, setOnboardingData } = useContext(OnboardingContext);
  const { colors, isDark } = useTheme();
  const [weightUnit, setWeightUnit] = useState(
    onboardingData.selectedWeightUnit || "kg"
  );
  const [currentWeight, setCurrentWeight] = useState(() => {
    const storedWeight = Number(onboardingData.weight) || 0;
    if (weightUnit === "lbs") return Math.round(storedWeight * 2.20462);
    return Math.round(storedWeight);
  });
  const [height, setHeight] = useState(
    onboardingData.height ? String(onboardingData.height) : ""
  );
  const [targetWeight, setTargetWeight] = useState(currentWeight);
  const [healthyRange, setHealthyRange] = useState("");
  const [pace, setPace] = useState(1);
  const [weeks, setWeeks] = useState(0);
  const [estDate, setEstDate] = useState("");

  // On mount, read from AsyncStorage if context is missing
  useEffect(() => {
    const getLocalOnboarding = async () => {
      if (!onboardingData.weight || !onboardingData.height) {
        try {
          const w = await AsyncStorage.getItem("kalry_onboarding_weight");
          const h = await AsyncStorage.getItem("kalry_onboarding_height");
          const u = await AsyncStorage.getItem("kalry_onboarding_unit");
          if (w && h && u) {
            setOnboardingData((prev) => ({
              ...prev,
              weight: w,
              height: h,
              selectedWeightUnit: u,
            }));
            setCurrentWeight(
              u === "lbs" ? Math.round(Number(w)) : Math.round(Number(w))
            );
            setHeight(String(h));
            setWeightUnit(u);
          }
        } catch (e) {
          console.warn(
            "Failed to load onboarding weight/height from storage",
            e
          );
        }
      }
    };
    getLocalOnboarding();
  }, [onboardingData.weight, onboardingData.height, setOnboardingData]);

  // Only fetch from Supabase if context/local storage is missing and user is logged in
  useEffect(() => {
    if (!onboardingData.weight || !onboardingData.height) {
      const fetchProfile = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data: profile } = await supabase
            .from("user_profile")
            .select("weight, height")
            .eq("id", session.user.id)
            .single();
          if (profile) {
            if (profile.weight) {
              setOnboardingData((prev) => ({
                ...prev,
                weight: profile.weight,
              }));
              setCurrentWeight(
                weightUnit === "lbs"
                  ? Math.round(Number(profile.weight) * 2.20462)
                  : Math.round(Number(profile.weight))
              );
            }
            if (profile.height) {
              setOnboardingData((prev) => ({
                ...prev,
                height: profile.height,
              }));
              setHeight(String(profile.height));
            }
          }
        }
      };
      fetchProfile();
    }
  }, [
    onboardingData.weight,
    onboardingData.height,
    setOnboardingData,
    weightUnit,
  ]);

  // Calculate healthy range based on height
  useEffect(() => {
    if (height) {
      const heightInMeters = parseFloat(height) / 100;
      let minHealthy = 18.5 * heightInMeters * heightInMeters;
      let maxHealthy = 24.9 * heightInMeters * heightInMeters;
      if (weightUnit === "lbs") {
        minHealthy = Math.round(minHealthy * 2.20462);
        maxHealthy = Math.round(maxHealthy * 2.20462);
        setHealthyRange(`${minHealthy} - ${maxHealthy} lbs`);
      } else {
        setHealthyRange(
          `${Math.round(minHealthy)} - ${Math.round(maxHealthy)} kg`
        );
      }
    }
  }, [height, weightUnit]);

  useEffect(() => {
    // Calculate weeks and estimated date
    let diff = Math.abs(Number(targetWeight) - Number(currentWeight));
    let paceVal = pace;
    if (weightUnit === "lbs") {
      diff = diff / 2.20462;
      paceVal = pace / 2.20462;
    }
    const wks = paceVal > 0 ? Math.ceil(diff / paceVal) : 0;
    setWeeks(wks);
    if (wks > 0) {
      const now = new Date();
      now.setDate(now.getDate() + wks * 7);
      setEstDate(
        now.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    } else {
      setEstDate("");
    }
  }, [targetWeight, pace, weightUnit, currentWeight]);

  const handleContinue = async () => {
    let targetWeightInKg = targetWeight;
    let weeklyTargetInKg = pace;
    if (weightUnit === "lbs") {
      targetWeightInKg = (Number(targetWeight) / 2.20462).toFixed(1);
      weeklyTargetInKg = (pace / 2.20462).toFixed(2);
    }
    setOnboardingData({
      ...onboardingData,
      target_weight: targetWeightInKg,
      target_weight_unit: "kg",
      weekly_target: weeklyTargetInKg,
    });
    navigation.navigate("TimePerDay");
  };

  // Calculate difference
  const weightDiff = Math.round(Number(currentWeight) - Number(targetWeight));
  let diffColor =
    weightDiff > 0 ? SUCCESS_GREEN : weightDiff < 0 ? ENERGY_ORANGE : colors.textSecondary;
  let diffText = "";
  if (weightDiff > 0) diffText = `-${Math.abs(weightDiff)} ${weightUnit}`;
  else if (weightDiff < 0) diffText = `+${Math.abs(weightDiff)} ${weightUnit}`;
  else diffText = `0 ${weightUnit}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
            <Text style={styles.subtitle}>TARGET WEIGHT</Text>
            <Text style={styles.title}>Set your weight goal</Text>
            <Text style={styles.description}>
              We&apos;ll help you track and reach it safely over time
            </Text>
          </View>

          {/* Current and Target Weight Modern Card */}
          <View style={styles.weightCardRow}>
            <View style={styles.weightCardWithBadge}>
              <View style={styles.weightCard}>
                <Text style={styles.weightCardLabel}>Current</Text>
                <Text style={styles.weightCardValue}>
                  {currentWeight}{" "}
                  <Text style={styles.weightCardUnit}>{weightUnit}</Text>
                </Text>
              </View>
            </View>
            <MaterialIcons
              name="arrow-forward"
              size={28}
              color={PRIMARY_PURPLE}
              style={{ marginHorizontal: 8, alignSelf: "center" }}
            />
            <View style={styles.weightCard}>
              <Text style={styles.weightCardLabel}>Target</Text>
              <View style={styles.targetInputRow}>
                <TextInput
                  style={styles.targetInputBlack}
                  value={String(Math.round(targetWeight))}
                  onChangeText={(text) => {
                    let val = text.replace(/[^0-9]/g, "");
                    setTargetWeight(val);
                  }}
                  keyboardType="numeric"
                  textAlign="right"
                  maxLength={5}
                />
                <Text style={styles.inputUnitInline}>{weightUnit}</Text>
              </View>
            </View>
          </View>

          {/* Weight difference and healthy range in modern badges */}
          <View style={styles.badgeRowModern}>
            <View
              style={[
                styles.diffBadgeModern,
                { backgroundColor: diffColor + "22", borderColor: diffColor },
              ]}
            >
              <Text style={[styles.diffBadgeTextModern, { color: diffColor }]}>
                {diffText}
              </Text>
            </View>
            {healthyRange ? (
              <View style={styles.healthyRangePill}>
                <Text style={styles.healthyRangePillText}>{healthyRange}</Text>
              </View>
            ) : null}
          </View>

          {/* Very small info message */}
          <Text style={styles.infoTextSmall}>
            Kalry does not recommend weight targets.
          </Text>

          <View style={styles.paceSection}>
            <Text style={styles.choosePace}>Choose your weekly pace</Text>
            <View style={styles.paceGrid}>
              {paceOptions.map((opt, idx) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.paceBtn, pace === opt && styles.paceBtnActive]}
                  onPress={() => setPace(opt)}
                >
                  <Text
                    style={[
                      styles.paceBtnText,
                      pace === opt && styles.paceBtnTextActive,
                    ]}
                  >
                    {opt} {weightUnit}/week
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.safePaceRow}>
              <MaterialIcons
                name="favorite"
                size={18}
                color={ENERGY_ORANGE}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.safePaceText}>Safe & sustainable pace</Text>
            </View>
          </View>

          {/* Estimated Time and Date in separate modern cards, stacked vertically */}
          <View style={styles.estimateColumnBoxes}>
            <View style={styles.estimateBoxRow}>
              <View style={styles.estimateIconWrap}>
                <MaterialIcons
                  name="calendar-today"
                  size={24}
                  color={colors.textPrimary}
                />
              </View>
              <View style={styles.estimateTextCol}>
                <Text style={styles.estimateLabel}>Estimated Time</Text>
                <Text style={styles.estimateValue}>
                  {weeks > 0 ? `${weeks} weeks` : "--"}
                </Text>
              </View>
            </View>
            <View style={styles.estimateBoxRow}>
              <View style={styles.estimateIconWrap}>
                <MaterialIcons
                  name="event-available"
                  size={24}
                  color={colors.textPrimary}
                />
              </View>
              <View style={styles.estimateTextCol}>
                <Text style={styles.estimateLabel}>Estimated Date</Text>
                <Text style={styles.estimateValue}>{estDate || "--"}</Text>
              </View>
            </View>
          </View>

          
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <View style={styles.buttonActive}>
            <Text style={styles.buttonText}>Continue</Text>
            <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: LIGHT_BG 
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
    paddingBottom: 100 
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  header: {
    marginBottom: 28,
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
  weightCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: 8,
  },
  weightCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    minWidth: 110,
  },
  weightCardLabel: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    fontFamily: "Manrope-Regular",
    marginBottom: 2,
  },
  weightCardValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: TEXT_PRIMARY,
    fontFamily: "Lexend-Bold",
  },
  weightCardUnit: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    fontFamily: "Manrope-Regular",
  },
  targetInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  targetInputBlack: {
    fontSize: 36,
    color: "#000",
    fontWeight: "bold",
    backgroundColor: "transparent",
    borderWidth: 0,
    width: 90,
    height: 60,
    textAlign: "right",
    marginBottom: 2,
    fontFamily: "Lexend-Bold",
    marginRight: 4,
  },
  inputUnitInline: {
    fontSize: 20,
    color: TEXT_SECONDARY,
    fontWeight: "bold",
    fontFamily: "Manrope-Regular",
    marginLeft: 2,
  },
  weightDiff: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 6,
    marginBottom: 2,
    textAlign: "center",
    fontFamily: "Manrope-Regular",
  },
  healthyPill: {
    alignSelf: "center",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 7,
    marginVertical: 8,
    borderWidth: 1,
  },
  healthyPillText: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Lexend-Bold",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  paceSection: {
    width: "100%",
    marginBottom: 20,
  },
  choosePace: {
    fontSize: 16,
    color: TEXT_PRIMARY,
    marginTop: 5,
    marginBottom: 8,
    fontWeight: "bold",
    fontFamily: "Lexend-Bold",
  },
  paceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  paceBtn: {
    width: "48%",
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 10,
    backgroundColor: CARD_BG,
    alignItems: "center",
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  paceBtnActive: { 
    backgroundColor: PRIMARY_PURPLE,
    borderColor: PRIMARY_PURPLE,
  },
  paceBtnText: { 
    color: TEXT_PRIMARY, 
    fontWeight: "bold", 
    fontSize: 15,
    fontFamily: "Manrope-Regular",
  },
  paceBtnTextActive: { 
    color: "#fff" 
  },
  safePaceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    marginTop: 2,
  },
  safePaceText: { 
    color: ENERGY_ORANGE, 
    fontWeight: "bold", 
    fontSize: 15,
    fontFamily: "Manrope-Regular",
  },
  estimateColumnBoxes: {
    flexDirection: "column",
    width: "100%",
    marginVertical: 12,
    gap: 12,
  },
  estimateBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: PRIMARY_PURPLE,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    marginHorizontal: 2,
  },
  estimateBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 10,
  },
  estimateTextCol: { flexDirection: "column", justifyContent: "center" },
  estimateLabel: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontFamily: "Manrope-Regular",
    marginBottom: 2,
  },
  estimateValue: {
    color: TEXT_PRIMARY,
    fontWeight: "bold",
    fontSize: 19,
    fontFamily: "Lexend-Bold",
  },
  motivCard: {
    width: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 18,
    alignItems: "center",
    padding: 18,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  motivImg: { width: 80, height: 80, marginBottom: 10 },
  motivText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    textAlign: "center",
    fontFamily: "Manrope-Regular",
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
  badgeRowModern: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginVertical: 10,
  },
  diffBadgeModern: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
  },
  diffBadgeTextModern: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Lexend-Bold",
    letterSpacing: 0.2,
  },
  healthyRangePill: {
    borderRadius: 20,
    backgroundColor: PRIMARY_PURPLE + "22", // soft purple with opacity
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
    minWidth: 80,
  },
  healthyRangePillText: {
    fontSize: 16,
    fontWeight: "bold",
    color: PRIMARY_PURPLE,
    fontFamily: "Lexend-Bold",
    textAlign: "center",
  },
  infoTextSmall: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 2,
    marginBottom: 1,
    fontFamily: "Manrope-Regular",
  },
  estimateIconWrap: {
    backgroundColor: "#f6f8fa",
    borderRadius: 12,
    padding: 8,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    width: 48,
  },
  weightCardWithBadge: { flexDirection: "row", alignItems: "center" },
});

export default WeightGoalScreen;
