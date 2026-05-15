import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useContext, useEffect, useState } from "react";
import {
    Alert,
    Dimensions,
    FlatList,
    Alert as RNAlert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import { OnboardingContext } from "../context/OnboardingContext";
import supabase from "../lib/supabase";

// Global cache for WeightTrackerScreen (Instagram pattern)
const globalWeightCache = {
    isFetching: false,
    lastFetchTime: 0,
    CACHE_DURATION: 60000, // 60 seconds
    cachedData: null,
};

const PRIMARY = "#7B61FF";
const CARD_BG = "#F8F6FC";
const ACCENT_GREEN = "#1abc9c";
const ACCENT_RED = "#e74c3c";
const GRAY = "#888";
const WHITE = "#fff";


function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


const WeightTrackerScreen = ({ navigation }) => {
    const { onboardingData, setOnboardingData } = useContext(OnboardingContext);
    // Initialize state with cached data (Instagram pattern)
    const [logs, setLogs] = useState(() => globalWeightCache.cachedData?.logs || []);
    const [refreshing, setRefreshing] = useState(false);
    const [userProfile, setUserProfile] = useState(() => globalWeightCache.cachedData?.userProfile || null);


    // Get userId from Supabase Auth
    const [userId, setUserId] = useState(null);
    useEffect(() => {
        const getUserId = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            setUserId(session?.user?.id || null);
        };
        getUserId();
    }, []);


    // Fetch user profile and logs with caching (Instagram pattern)
    useFocusEffect(
        React.useCallback(() => {
            if (!userId) return;

            const now = Date.now();
            const timeSinceLastFetch = now - globalWeightCache.lastFetchTime;

            // Check cache - if fresh, restore from cache and skip fetch
            if (timeSinceLastFetch < globalWeightCache.CACHE_DURATION && globalWeightCache.cachedData) {
                // Only update state if it's different (prevent unnecessary re-renders)
                if (JSON.stringify(globalWeightCache.cachedData.logs) !== JSON.stringify(logs)) {
                    setLogs(globalWeightCache.cachedData.logs || []);
                }
                if (JSON.stringify(globalWeightCache.cachedData.userProfile) !== JSON.stringify(userProfile)) {
                    setUserProfile(globalWeightCache.cachedData.userProfile || null);
                    if (globalWeightCache.cachedData.userProfile) {
                        setOnboardingData((prev) => ({
                            ...prev,
                            weight: globalWeightCache.cachedData.userProfile.weight || prev.weight,
                            target_weight: globalWeightCache.cachedData.userProfile.target_weight || prev.target_weight,
                            selectedWeightUnit: globalWeightCache.cachedData.userProfile.weight_unit || prev.selectedWeightUnit || "kg",
                        }));
                    }
                }
                return; // Use cached data
            }

            // Prevent concurrent fetches
            if (globalWeightCache.isFetching) return;
            globalWeightCache.isFetching = true;

            const fetchData = async () => {
                try {
                    // Fetch user profile
                    const { data: profile, error: profileError } = await supabase
                        .from("user_profile")
                        .select("weight, target_weight, weight_unit")
                        .eq("id", userId)
                        .single();

                    if (!profileError && profile) {
                        setUserProfile(profile);
                        setOnboardingData((prev) => ({
                            ...prev,
                            weight: profile.weight || prev.weight,
                            target_weight: profile.target_weight || prev.target_weight,
                            selectedWeightUnit: profile.weight_unit || prev.selectedWeightUnit || "kg",
                        }));
                    }

                    // Fetch weight logs
                    const { data: logsData, error: logsError } = await supabase
                        .from("weight_logs")
                        .select("*")
                        .eq("user_id", userId)
                        .order("date", { ascending: false });

                    if (!logsError && logsData) {
                        setLogs(logsData);
                    }

                    // Update cache
                    globalWeightCache.cachedData = {
                        logs: logsData || [],
                        userProfile: profile || null,
                    };
                    globalWeightCache.lastFetchTime = Date.now();
                } catch (error) {
                    // Silent error handling
                } finally {
                    globalWeightCache.isFetching = false;
                }
            };
            fetchData();
        }, [userId, refreshing, setOnboardingData])
    );


    // Refresh after adding new weight
    useEffect(() => {
        const unsubscribe = navigation.addListener("focus", () => {
            setRefreshing((r) => !r); // triggers data refetch
        });
        return unsubscribe;
    }, [navigation]);


    // --- Weight Logic ---
    const weightUnit = userProfile?.weight_unit || onboardingData?.selectedWeightUnit || "kg";
    // Current weight: from user profile, or most recent log's weight, or 0 if no data
    const currentWeight = userProfile?.weight || (logs.length > 0 ? Number(logs[0].weight) : 0);
    // Weekly change: find log closest to 7 days ago, or use originalWeight if no log
    let weeklyChange = 0;
    if (logs.length > 0) {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        let closest = logs[0];
        let minDiff = Math.abs(new Date(logs[0].date) - weekAgo);
        for (let log of logs) {
            const diff = Math.abs(new Date(log.date) - weekAgo);
            if (diff < minDiff) {
                minDiff = diff;
                closest = log;
            }
        }
        weeklyChange = (currentWeight - Number(closest.weight)).toFixed(1);
    } else {
        weeklyChange = 0;
    }


    // Chart data and configuration
    const screenWidth = Dimensions.get('window').width - 32;

    // Helper function to get week number in month
    const getWeekOfMonth = (date) => {
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const dayOfMonth = date.getDate();
        const weekNum = Math.ceil((dayOfMonth + startOfMonth.getDay()) / 7);
        return weekNum;
    };

    // Generate current month's weekly data
    const generateWeeklyData = () => {
        const today = new Date();
        const weeks = [];
        const dataPoints = [];

        // Use current weight as the baseline
        const baseWeight = currentWeight || 0;

        // Get current month info
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const monthName = today.toLocaleDateString(undefined, { month: 'short' });

        // Calculate number of weeks in current month (usually 4-5 weeks)
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
        const weeksInMonth = getWeekOfMonth(lastDayOfMonth);

        // Get current week number
        const currentWeekNum = getWeekOfMonth(today);

        // Generate data for each week in the current month
        for (let weekNum = 1; weekNum <= weeksInMonth; weekNum++) {
            // Find first day of this week in the month
            let weekDate = null;
            for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
                const date = new Date(currentYear, currentMonth, day);
                if (getWeekOfMonth(date) === weekNum) {
                    weekDate = date;
                    break;
                }
            }

            if (weekDate) {
                // Find if there's a weight log for this week
                // Use a simpler approach: check if any log falls within this week
                const weekStart = new Date(weekDate);
                weekStart.setDate(weekDate.getDate() - weekDate.getDay()); // Start of week (Sunday)
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)

                // Find log in this week
                const logInWeek = logs.find(log => {
                    const logDate = new Date(log.date);
                    // Set time to start of day for accurate comparison
                    logDate.setHours(0, 0, 0, 0);
                    const weekStartCopy = new Date(weekStart);
                    weekStartCopy.setHours(0, 0, 0, 0);
                    const weekEndCopy = new Date(weekEnd);
                    weekEndCopy.setHours(23, 59, 59, 999);

                    return logDate >= weekStartCopy && logDate <= weekEndCopy;
                });

                let weightValue;
                if (logInWeek) {
                    // Use the logged weight for this week
                    const weight = Number(logInWeek.weight);
                    weightValue = weightUnit === 'lbs' ? Number((weight * 2.20462).toFixed(1)) : weight;
                } else {
                    // For weeks without data, show 0
                    weightValue = 0;
                }

                // Add month name only for the first week, then just week numbers
                if (weekNum === 1) {
                    weeks.push(`${monthName} W${weekNum}`);
                } else {
                    weeks.push(`W${weekNum}`);
                }
                dataPoints.push(weightValue);
            }
        }

        return { weeks, dataPoints };
    };

    // Get weight entries for chart
    let chartWeightData = [];
    let chartLabels = [];

    if (logs.length > 0 || currentWeight > 0) {
        const { weeks, dataPoints } = generateWeeklyData();
        chartLabels = weeks;
        chartWeightData = dataPoints;
    } else {
        // No data at all - show empty chart
        chartWeightData = [0];
        chartLabels = [''];
    }

    const chartData = {
        labels: chartLabels,
        datasets: [
            {
                data: chartWeightData.length > 0 ? chartWeightData : [0],
                color: (opacity = 1) => `rgba(123, 97, 255, ${opacity})`,
                strokeWidth: 2,
            },
        ],
    };

    const chartConfig = {
        backgroundColor: '#F8FAFC',
        backgroundGradientFrom: '#F8FAFC',
        backgroundGradientTo: '#F8FAFC',
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(123, 97, 255, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(102, 102, 102, ${opacity})`,
        propsForDots: { r: '4', strokeWidth: '2', stroke: '#7B61FF' },
        propsForBackgroundLines: {
            strokeDasharray: '',
            stroke: '#E5E7EB',
            strokeWidth: 1,
        },
    };


    // Delete log handler
    const handleDeleteLog = async (logId) => {
        RNAlert.alert(
            "Delete Entry",
            "Are you sure you want to delete this weight entry?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const { error } = await supabase
                            .from("weight_logs")
                            .delete()
                            .eq("id", logId);
                        if (error) {
                            Alert.alert("Error", error.message);
                        } else {
                            setRefreshing((r) => !r);
                        }
                    },
                },
            ]
        );
    };


    const renderHeader = () => (
        <>
            <Text style={styles.subheader}>
                See how far you&apos;ve come, at your pace.
            </Text>
            {/* Today's Weight Card */}
            <View style={styles.todaysWeightCard}>
                <Text style={styles.todaysWeightLabel}>Current Weight</Text>
                <View style={styles.weightDisplay}>
                    <Text style={styles.weightValue}>
                        {currentWeight ? Number(currentWeight).toFixed(0) : "--"}
                    </Text>
                    <Text style={styles.weightUnit}>{weightUnit}</Text>
                </View>
                <Text
                    style={[
                        styles.weightChange,
                        { color: weeklyChange < 0 ? ACCENT_GREEN : ACCENT_RED },
                    ]}
                >
                    {weeklyChange < 0 ? "-" : "+"}
                    {Math.abs(weeklyChange)} {weightUnit} since last week
                </Text>
            </View>


            {/* Progress Chart */}
            <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                    <Text style={styles.chartTitle}>Progress</Text>
                    <View style={styles.chartFilter}>
                        <Text style={styles.chartFilterText}>Last 30 Days</Text>
                        <Ionicons name="chevron-down" size={16} color="#7B61FF" />
                    </View>

                </View>
                <View>
                    <LineChart
                        data={chartData}
                        width={screenWidth - 64}
                        height={220}
                        yAxisSuffix={` ${weightUnit}`}
                        chartConfig={chartConfig}
                        bezier
                        withInnerLines={false}
                        withOuterLines={true}
                        fromZero={true}
                        segments={5}
                        style={{
                            alignSelf: 'center',
                            borderRadius: 16,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.1,
                            shadowRadius: 4,
                            elevation: 3
                        }}
                    />
                </View>
            </View>
        </>
    );


    return (
        <SafeAreaView style={styles.container}>
            {/* Custom Header */}
            <View style={styles.customHeader}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.navigate('MainDashboard')}
                >
                    <Ionicons name="chevron-back" size={24} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Weight Tracker</Text>
                <View style={styles.headerSpacer} />
            </View>

            <FlatList
                data={logs}
                keyExtractor={(item) => item.id?.toString() || item.date}
                renderItem={({ item }) => (
                    <View style={styles.historyItem}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}
                        >
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
                                <Text style={styles.historyEmoji}>{item.emoji || "😊"}</Text>
                            </View>
                            <Text style={styles.historyWeight}>
                                {Number(item.weight).toFixed(1)} {weightUnit}
                            </Text>
                            <TouchableOpacity
                                onPress={() => handleDeleteLog(item.id)}
                                style={{ marginLeft: 10 }}
                            >
                                <Ionicons name="trash" size={20} color={ACCENT_RED} />
                            </TouchableOpacity>
                        </View>
                        {item.note ? (
                            <Text style={styles.historyNote}>{item.note}</Text>
                        ) : null}
                    </View>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyHistory}>No weight entries yet.</Text>
                }
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.scrollContent}
            />
            <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate("AddWeightScreen")}
            >
                <Ionicons name="add" size={24} color={WHITE} />
                <Text style={styles.addBtnText}>Add New Weight</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};


const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: WHITE },
    customHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: WHITE,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    backButton: {
        padding: 8,
        marginRight: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1F2937',
        fontFamily: 'Lexend-Bold',
        flex: 1,
        textAlign: 'center',
    },
    headerSpacer: {
        width: 40, // Same width as back button to center the title
    },
    scrollContent: { padding: 20, paddingBottom: 100 },
    header: {
        fontSize: 28,
        fontWeight: "bold",
        color: PRIMARY,
        marginTop: 10,
        marginBottom: 2,
        fontFamily: "Lexend-Bold",
    },
    subheader: {
        fontSize: 16,
        color: GRAY,
        marginBottom: 18,
        fontFamily: "Manrope-Regular",
    },
    todaysWeightCard: {
        backgroundColor: WHITE,
        borderRadius: 20,
        padding: 20,
        marginBottom: 18,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    todaysWeightLabel: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1F2937",
        fontFamily: "Lexend-Bold",
    },
    weightDisplay: {
        flexDirection: "row",
        alignItems: "baseline",
    },
    weightValue: {
        fontSize: 48,
        fontWeight: "800",
        color: "#1F2937",
        fontFamily: "Lexend-Bold",
    },
    weightUnit: {
        fontSize: 20,
        fontWeight: "400",
        color: "#1F2937",
        marginLeft: 4,
        fontFamily: "Manrope-Regular",
    },
    weightChange: {
        fontSize: 16,
        color: ACCENT_GREEN,
        fontFamily: "Manrope-Regular",
    },
    historyHeader: {
        fontSize: 20,
        fontWeight: "bold",
        color: PRIMARY,
        marginBottom: 8,
        fontFamily: "Lexend-Bold",
    },
    historyItem: {
        backgroundColor: WHITE,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: CARD_BG,
    },
    historyDate: {
        fontSize: 16,
        color: PRIMARY,
        fontFamily: "Manrope-Bold",
        marginRight: 8,
    },
    historyWeight: {
        fontSize: 18,
        color: PRIMARY,
        fontFamily: "Lexend-Bold",
        marginLeft: 8,
    },
    historyEmoji: { fontSize: 20, marginLeft: 4 },
    historyNote: {
        fontSize: 14,
        color: GRAY,
        marginTop: 2,
        fontFamily: "Manrope-Regular",
    },
    emptyHistory: {
        color: GRAY,
        fontSize: 16,
        textAlign: "center",
        marginTop: 20,
    },
    addBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PRIMARY,
        borderRadius: 32,
        paddingVertical: 18,
        margin: 20,
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
    },
    addBtnText: {
        color: WHITE,
        fontFamily: "Lexend-Bold",
        fontSize: 20,
        marginLeft: 8,
    },
    chartCard: {
        backgroundColor: WHITE,
        borderRadius: 20,
        padding: 16,
        marginBottom: 18,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    chartHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    chartTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#1F2937",
        fontFamily: "Lexend-Bold",
    },
    chartFilter: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F3E8FF",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chartFilterText: {
        fontSize: 14,
        color: "#7B61FF",
        fontFamily: "Manrope-Regular",
        marginRight: 4,
    },
});


// Export cache for external access
export { globalWeightCache };

// Wrap with React.memo to prevent unnecessary re-renders (Instagram pattern)
export default React.memo(WeightTrackerScreen); 