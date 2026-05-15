import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import supabase from '../lib/supabase';

const EMOJIS = ['😊', '😐', '😔', '😭', '😭'];

const AddWeightScreen = ({ navigation }) => {
    const [newWeight, setNewWeight] = useState('');
    const [newPhoto, setNewPhoto] = useState(null);
    const [newNote, setNewNote] = useState('');
    const [newEmoji, setNewEmoji] = useState(EMOJIS[0]);
    const [uploading, setUploading] = useState(false);
    const [userId, setUserId] = useState(null);
    const [userWeightUnit, setUserWeightUnit] = useState('kg');

    useEffect(() => {
        const getUserId = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const uid = session?.user?.id || null;
            setUserId(uid);

            // Fetch user's weight unit from profile
            if (uid) {
                const { data: profile } = await supabase
                    .from('user_profile')
                    .select('weight_unit')
                    .eq('id', uid)
                    .single();
                if (profile?.weight_unit) {
                    setUserWeightUnit(profile.weight_unit);
                }
            }
        };
        getUserId();
    }, []);

    async function pickPhoto() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            setNewPhoto(result.assets[0]);
        }
    }

    async function handleAddWeight() {
        const cleanedWeight = newWeight.replace(/\s|\u00A0/g, '').replace(',', '.');
        console.log('newWeight:', newWeight, 'cleanedWeight:', cleanedWeight, 'Number(cleanedWeight):', Number(cleanedWeight));
        if (!userId || !cleanedWeight || isNaN(Number(cleanedWeight)) || Number(cleanedWeight) <= 0) {
            Alert.alert('Missing info', 'Please enter your weight.');
            return;
        }
        setUploading(true);
        let photo_url = null;
        if (newPhoto) {
            const fileExt = newPhoto.uri.split('.').pop();
            const fileName = `${userId}_${Date.now()}.${fileExt}`;
            const { data, error } = await supabase.storage.from('weight-photos').upload(fileName, {
                uri: newPhoto.uri,
                type: 'image/jpeg',
                name: fileName,
            });
            if (error) {
                setUploading(false);
                Alert.alert('Photo upload failed', error.message);
                return;
            }
            photo_url = data?.path ? supabase.storage.from('weight-photos').getPublicUrl(data.path).publicUrl : null;
        }
        const today = new Date().toISOString().slice(0, 10);
        let weightValue = parseFloat(cleanedWeight);
        // Convert to kg if user's unit is lbs
        if (userWeightUnit === 'lbs') weightValue = (weightValue / 2.20462).toFixed(2);
        const { data: insertData, error: insertError } = await supabase.from('weight_logs').insert([
            {
                user_id: userId,
                date: today,
                weight: weightValue,
                note: newNote,
                emoji: newEmoji,
                photo_url,
            }
        ]);
        console.log('Insert result:', insertData, insertError);
        if (insertError) {
            setUploading(false);
            Alert.alert('Error', insertError.message);
            return;
        }

        // Update user_profile table with the new weight
        const { error: profileError } = await supabase
            .from('user_profile')
            .update({
                weight: weightValue
            })
            .eq('id', userId);

        if (profileError) {
            console.log('Profile update error:', profileError);
            // Don't show error to user as the weight log was saved successfully
        }

        // Optimistic update - update WeightTrackerScreen cache immediately
        try {
            const { getMainDashboardCache } = require('../utils/cacheManager');
            const mainCache = getMainDashboardCache();
            if (mainCache.cachedData) {
                // Update weight in MainDashboard cache for Weight Journey card
                mainCache.cachedData.currentWeight = weightValue;
                mainCache.lastFetchTime = Date.now();
            }

            // Update WeightTrackerScreen cache
            const newLog = {
                user_id: userId,
                date: today,
                weight: weightValue,
                note: newNote,
                emoji: newEmoji,
                photo_url,
            };

            // Access the global cache from WeightTrackerScreen
            const globalWeightCache = require('./WeightTrackerScreen').globalWeightCache;
            if (globalWeightCache) {
                globalWeightCache.cachedData = {
                    ...globalWeightCache.cachedData,
                    logs: [newLog, ...(globalWeightCache.cachedData?.logs || [])],
                    userProfile: {
                        ...globalWeightCache.cachedData?.userProfile,
                        weight: weightValue,
                    },
                };
                globalWeightCache.lastFetchTime = Date.now();
            }
        } catch (error) {
            // Silent - cache might not exist yet
        }

        setUploading(false);
        navigation.goBack();
    }

    return (
        <SafeAreaView style={styles.modalFullBg}>
            {/* Custom Header */}
            <View style={styles.customHeader}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('WeightTrackerScreen')}
                    style={styles.backButton}
                >
                    <Ionicons name="chevron-back" size={28} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add New Weight</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                <TextInput
                    style={styles.weightInput}
                    placeholder={`Enter your weight (${userWeightUnit})`}
                    placeholderTextColor="#7B61FF99"
                    keyboardType="decimal-pad"
                    value={newWeight}
                    onChangeText={text => setNewWeight(text.replace(/[^0-9.,]/g, ''))}
                />
                <Text style={styles.sectionLabel}>Add a progress photo</Text>
                <View style={styles.photoUploadBoxDashed}>
                    {newPhoto ? (
                        <TouchableOpacity onPress={pickPhoto}>
                            <Image source={{ uri: newPhoto.uri }} style={styles.uploadedPhoto} />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.uploadBoxInner} onPress={pickPhoto}>
                            <Text style={styles.uploadPhotoTitle}>Upload a photo</Text>
                            <Text style={styles.uploadPhotoDesc}>Add a photo to track your progress</Text>
                            <View style={styles.uploadBtn}><Text style={styles.uploadBtnText}>Upload</Text></View>
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={styles.sectionLabel}>How are you feeling?</Text>
                <View style={styles.emojiRow}>
                    {EMOJIS.map((e, idx) => (
                        <TouchableOpacity key={e + idx} onPress={() => setNewEmoji(e)} style={[styles.emojiPill, newEmoji === e && styles.emojiPillActive]}>
                            <Text style={styles.emoji}>{e}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TextInput
                    style={styles.noteInput}
                    placeholder="Add a note (optional)"
                    placeholderTextColor="#7B61FF99"
                    value={newNote}
                    onChangeText={setNewNote}
                    multiline
                />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtnFull} onPress={handleAddWeight} disabled={uploading}>
                <Text style={styles.saveBtnTextFull}>{uploading ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    modalFullBg: { flex: 1, backgroundColor: '#FAF9FC' },
    customHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FAF9FC',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1F2937',
        fontFamily: 'Lexend-Bold',
        flex: 1,
        textAlign: 'center',
    },
    backButton: {
        width: 40,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    weightInput: { borderWidth: 0, backgroundColor: '#ECE7F7', borderRadius: 16, padding: 18, fontFamily: 'Manrope-Regular', fontSize: 18, color: '#7B61FF', width: '100%', marginBottom: 16 },
    sectionLabel: { fontSize: 18, fontFamily: 'Lexend-Bold', color: '#111', marginBottom: 8, marginTop: 18 },
    photoUploadBoxDashed: { borderWidth: 2, borderColor: '#D1C7F7', borderStyle: 'dashed', borderRadius: 16, padding: 24, marginBottom: 10, backgroundColor: '#F8F6FC', alignItems: 'center' },
    uploadBoxInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    uploadedPhoto: { width: 120, height: 120, borderRadius: 16, marginVertical: 8 },
    uploadPhotoTitle: { fontSize: 20, fontFamily: 'Lexend-Bold', color: '#111', marginBottom: 4, textAlign: 'center' },
    uploadPhotoDesc: { fontSize: 15, fontFamily: 'Manrope-Regular', color: '#444', textAlign: 'center', marginBottom: 12 },
    uploadBtn: { padding: 10, backgroundColor: '#ECE7F7', borderRadius: 24, minWidth: 100, alignItems: 'center' },
    uploadBtnText: { color: '#111', fontFamily: 'Lexend-Bold', fontSize: 18 },
    emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, marginTop: 8 },
    emojiPill: { padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#D1C7F7', marginRight: 8, backgroundColor: '#FAF9FC' },
    emojiPillActive: { backgroundColor: '#ECE7F7', borderColor: '#7B61FF' },
    emoji: { fontSize: 28 },
    noteInput: { borderWidth: 0, backgroundColor: '#ECE7F7', borderRadius: 16, padding: 18, fontFamily: 'Manrope-Regular', fontSize: 16, color: '#7B61FF', width: '100%', marginBottom: 10, minHeight: 80 },
    saveBtnFull: { backgroundColor: '#6C3DF4', borderRadius: 32, paddingVertical: 18, alignItems: 'center', width: '90%', alignSelf: 'center', marginBottom: 24, marginTop: 8 },
    saveBtnTextFull: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 22 },
});

export default AddWeightScreen;