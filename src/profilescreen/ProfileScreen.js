import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import supabase from '../lib/supabase';
import { getResponsiveFontSize, getResponsivePadding } from '../utils/responsive';

// Updated FooterBar component with oval design
const FooterBar = ({ navigation, activeTab, palette, isDark }) => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const footerStyles = useMemo(() => createFooterStyles(palette, isDark), [palette, isDark]);
  
  const tabs = [
    {
      key: 'Home',
      label: 'Home',
      icon: <Ionicons name="home-outline" size={24} color={activeTab === 'Home' ? palette.primary : palette.textSecondary} />,
      route: 'MainDashboard',
    },
    
    {
      key: 'Meals',
      label: 'Meals',
      icon: <Ionicons name="restaurant-outline" size={24} color={activeTab === 'Meals' ? palette.primary : palette.textSecondary} />,
      route: 'Home',
    },
    {
      key: 'Workout',
      label: 'Workout',
      icon: <Ionicons name="barbell-outline" size={24} color={activeTab === 'Workout' ? palette.primary : palette.textSecondary} />,
      route: 'Exercise',
    },
    {
      key: 'Profile',
      label: 'Profile',
      icon: <Ionicons name="person-outline" size={24} color={activeTab === 'Profile' ? palette.primary : palette.textSecondary} />,
      route: 'Profile',
    },
  ];

  return (
    <View style={[footerStyles.container, { bottom: insets.bottom >= 20 ? (insets.bottom + getResponsivePadding(16)) : getResponsivePadding(16) }]}>
      <View style={footerStyles.ovalFooter}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              footerStyles.tab,
              tab.key === activeTab && footerStyles.activeTab
            ]}
            onPress={() => {
              // Don't navigate if already on active tab
              if (tab.key === activeTab) return;
              
              navigation.navigate(tab.route);
            }}
            activeOpacity={0.7}
          >
            {React.cloneElement(tab.icon, {
              color: tab.key === activeTab ? palette.primary : palette.textSecondary,
            })}
            <Text
              style={[
                footerStyles.label,
                tab.key === activeTab && footerStyles.activeLabel
              ]}
            >
              {tab.label}
            </Text>
            {tab.key === activeTab && <View style={footerStyles.activeIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Global cache for ProfileScreen (similar to other screens)
export const globalProfileCache = {
  lastFetchTime: 0,
  CACHE_DURATION: 300000, // 5 minutes - profile data doesn't change often
  cachedData: null,
};

const ProfileScreen = () => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const palette = useMemo(() => createPalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  
  // Note: Removed automatic redirect check - ProfileScreen should be accessible to all users
  // The onboarding flow handles navigation during initial setup
  
  // Initialize state from cache if available (prevents loading flash)
  const [userProfile, setUserProfile] = useState(() => {
    const now = Date.now();
    const timeSinceLastFetch = now - globalProfileCache.lastFetchTime;
    const isCacheValid = timeSinceLastFetch < globalProfileCache.CACHE_DURATION;
    return (isCacheValid && globalProfileCache.cachedData?.userProfile) || null;
  });
  
  const [loading, setLoading] = useState(() => {
    const now = Date.now();
    const timeSinceLastFetch = now - globalProfileCache.lastFetchTime;
    const isCacheValid = timeSinceLastFetch < globalProfileCache.CACHE_DURATION;
    return !(isCacheValid && globalProfileCache.cachedData); // Only show loading if no valid cache
  });
  
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(() => {
    const now = Date.now();
    const timeSinceLastFetch = now - globalProfileCache.lastFetchTime;
    const isCacheValid = timeSinceLastFetch < globalProfileCache.CACHE_DURATION;
    return (isCacheValid && globalProfileCache.cachedData?.profilePhotoUrl) || null;
  });
  
  const [uploading, setUploading] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  
  // Load profile data on mount and when needed (like StepTrackerScreen - no useFocusEffect)
  useEffect(() => {
    const loadProfile = async () => {
      const now = Date.now();
      const timeSinceLastFetch = now - globalProfileCache.lastFetchTime;
      const isCacheValid = timeSinceLastFetch < globalProfileCache.CACHE_DURATION;

      // If cache is valid, restore from cache and skip fetch
      if (isCacheValid && globalProfileCache.cachedData) {
        const cached = globalProfileCache.cachedData;
        
        // Restore from cache (only update if different to prevent unnecessary re-renders)
        setUserProfile(prev => {
          const prevStr = JSON.stringify(prev);
          const cachedStr = JSON.stringify(cached.userProfile);
          return prevStr !== cachedStr ? cached.userProfile : prev;
        });
        
        setProfilePhotoUrl(prev => {
          return prev !== cached.profilePhotoUrl ? cached.profilePhotoUrl : prev;
        });
        
        setLoading(false);
        return; // Use cached data
      }

      // Cache is stale or doesn't exist - fetch fresh data
      await fetchUserProfile();
    };

    loadProfile();
     
  }, []); // Only run on mount
  
  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user found');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_profile')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        setLoading(false);
        return;
      }

      // Set profile data immediately (don't wait for photo URL)
      setUserProfile(data);
      setLoading(false); // Stop loading immediately after getting profile data
      
      // Fetch profile photo asynchronously (non-blocking)
      let photoUrl = null;
      if (data.photo_url) {
        try {
          // If it's a storage path, generate a signed URL with very long expiry (10 years)
          // Keep bucket private for security - signed URLs provide access control
          if (!data.photo_url.startsWith('http')) {
            const { data: signedUrlData } = await supabase.storage
              .from('profile-photos')
              .createSignedUrl(data.photo_url, 60 * 60 * 24 * 365 * 10); // 10 years expiry (effectively never expires)
            
            if (signedUrlData?.signedUrl) {
              photoUrl = signedUrlData.signedUrl;
              setProfilePhotoUrl(photoUrl);
            }
          } else {
            // If it's already a full URL, use it directly
            photoUrl = data.photo_url;
            setProfilePhotoUrl(photoUrl);
          }
        } catch (error) {
          console.error('Error fetching profile photo:', error);
          // Don't block UI - photo will just not show
        }
      }

      // Update cache with fresh data
      globalProfileCache.cachedData = {
        userProfile: data,
        profilePhotoUrl: photoUrl,
      };
      globalProfileCache.lastFetchTime = Date.now();
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setLoading(false);
    }
  };
  
  const handleProfilePhotoPress = async () => {
    // If we have a profile with photo_url, ensure we have the signed URL
    if (userProfile?.photo_url) {
      setImageViewerVisible(true); // Open modal immediately
      
      // If we don't have a profilePhotoUrl yet, fetch it
      if (!profilePhotoUrl) {
        setImageLoading(true);
        try {
          let photoUrl = null;
          console.log('Fetching photo URL from storage:', userProfile.photo_url);
          
          // If it's a storage path, generate a signed URL
          if (!userProfile.photo_url.startsWith('http')) {
            const { data: signedUrlData, error: urlError } = await supabase.storage
              .from('profile-photos')
              .createSignedUrl(userProfile.photo_url, 60 * 60 * 24 * 365 * 10); // 10 years expiry
            
            if (urlError) {
              console.error('Error creating signed URL:', urlError);
              setImageLoading(false);
              return;
            }
            
            if (signedUrlData?.signedUrl) {
              photoUrl = signedUrlData.signedUrl;
              console.log('✅ Got signed URL:', photoUrl);
              setProfilePhotoUrl(photoUrl);
              
              // Update cache
              if (globalProfileCache.cachedData) {
                globalProfileCache.cachedData.profilePhotoUrl = photoUrl;
              }
              setImageLoading(false); // Reset loading after setting URL
            }
          } else {
            // If it's already a full URL, use it directly
            photoUrl = userProfile.photo_url;
            setProfilePhotoUrl(photoUrl);
            setImageLoading(false);
          }
        } catch (error) {
          console.error('Error fetching profile photo URL:', error);
          setImageLoading(false);
        }
      }
      return;
    }
    
    // If no photo, open image picker directly
    await openImagePicker();
  };

  const openImagePicker = async () => {
    try {
      // Launch image picker directly (same approach as AddWeightScreen)
      // The system will handle permissions automatically if needed
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for profile photos
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];
        await uploadProfilePhoto(selectedImage.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      // If permission error, show helpful message
      if (error.message?.includes('permission') || error.message?.includes('Permission')) {
        Alert.alert(
          'Permission Required',
          'Gallery permission is required. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', `Failed to pick image: ${error.message || 'Please try again.'}`);
      }
    }
  };

  const handleEditPhoto = async () => {
    setImageViewerVisible(false);
    await openImagePicker();
  };
  
  const uploadProfilePhoto = async (imageUri) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not logged in');
        return;
      }
      
      // Delete old photo if exists
      if (userProfile?.photo_url && !userProfile.photo_url.startsWith('http')) {
        try {
          await supabase.storage
            .from('profile-photos')
            .remove([userProfile.photo_url]);
        } catch (error) {
          console.error('Error deleting old photo:', error);
          // Continue even if deletion fails
        }
      }
      
      // Upload new photo
      // File path format: {user_id}/{timestamp}.jpg to match RLS policy
      const fileName = `${user.id}/${Date.now()}.jpg`;
      
      // Convert image URI to ArrayBuffer for upload
      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();
      
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Update user_profile with photo_url
      const { error: updateError } = await supabase
        .from('user_profile')
        .update({ photo_url: fileName })
        .eq('id', user.id);
      
      if (updateError) {
        throw updateError;
      }
      
      // Generate signed URL for immediate display (10 years expiry - effectively never expires)
      // Keep bucket private for security - signed URLs provide access control
      // fileName is already in format: {user_id}/{timestamp}.jpg
      const { data: signedUrlData } = await supabase.storage
        .from('profile-photos')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10); // 10 years expiry
      
      if (signedUrlData?.signedUrl) {
        setProfilePhotoUrl(signedUrlData.signedUrl);
      }
      
      // Update local state
      setUserProfile(prev => ({ ...prev, photo_url: fileName }));
      
      // Update cache with new photo URL
      globalProfileCache.cachedData = {
        ...globalProfileCache.cachedData,
        userProfile: { ...userProfile, photo_url: fileName },
        profilePhotoUrl: signedUrlData.signedUrl,
      };
      globalProfileCache.lastFetchTime = Date.now();
      
      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      Alert.alert('Error', `Failed to upload profile photo: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };
  
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('MainDashboard')}>
          <Ionicons name="chevron-back" size={24} color={palette.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: insets.bottom >= 20 ? (120 + insets.bottom) : 120 }} 
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity 
              style={styles.avatar}
              onPress={handleProfilePhotoPress}
              disabled={uploading}
              activeOpacity={profilePhotoUrl ? 0.8 : 1}
            >
              {profilePhotoUrl ? (
                <Image
                  source={{ uri: profilePhotoUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={60} color={palette.textMuted} />
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.cameraButton}
              onPress={handleProfilePhotoPress}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={palette.textSecondary} />
              ) : (
                <Ionicons name="camera" size={16} color={palette.textSecondary} />
              )}
            </TouchableOpacity>
          </View>
          
          <Text style={styles.profileName}>{userProfile?.name || 'User'}</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStatsSection}>
          <Text style={styles.sectionTitle}>Quick Stats</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>7</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>25</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>1500</Text>
              <Text style={styles.statLabel}>Kalry Points</Text>
            </View>
          </View>
        </View>

        {/* Settings Menu */}
        <View style={styles.settingsSection}>
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate('PersonalInfo')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="person-outline" size={20} color={palette.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Personal Info</Text>
                <Text style={styles.settingSubtitle}>Name, Email, Birthday</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate('Preferences')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="options-outline" size={20} color={palette.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Preferences</Text>
                <Text style={styles.settingSubtitle}>Units, Reminders, Theme</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate('AppSettings')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="settings-outline" size={20} color={palette.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>App Settings</Text>
                <Text style={styles.settingSubtitle}>Notifications, AI Insights, Privacy</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="link-outline" size={20} color={palette.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Connected Devices</Text>
                <Text style={styles.settingSubtitle}>Sync with Apple Health, Google Fit</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="shield-outline" size={20} color={palette.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Privacy & Security</Text>
                <Text style={styles.settingSubtitle}>Password, 2FA, Data</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Updated FooterBar with oval design */}
      <FooterBar navigation={navigation} activeTab="Profile" palette={palette} isDark={isDark} />

      {/* Square Image Viewer Modal - FIXED VERSION */}
      <Modal
        visible={imageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setImageViewerVisible(false);
          setImageLoading(false);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setImageViewerVisible(false);
          setImageLoading(false);
        }}>
          <View style={styles.imageViewerContainer}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.squareModal}>
                {/* Edit button (top right) */}
                <TouchableOpacity
                  style={styles.editButtonInModal}
                  onPress={handleEditPhoto}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.editButtonTextInModal}>Edit</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Image inside square modal */}
                {imageLoading ? (
                  <View style={styles.squareModalPlaceholder}>
                    <ActivityIndicator size="large" color={palette.primary} />
                    <Text style={styles.loadingImageText}>Loading image...</Text>
                  </View>
                ) : profilePhotoUrl ? (
                  <Image
                    source={{ uri: profilePhotoUrl }}
                    style={styles.squareModalImage}
                    resizeMode="cover"
                    onLoadEnd={() => setImageLoading(false)}
                    onError={(error) => {
                      setImageLoading(false);
                      console.error('❌ Image load error in modal:', error.nativeEvent?.error || error);
                      console.error('Failed URL:', profilePhotoUrl);
                    }}
                  />
                ) : (
                  <View style={styles.squareModalPlaceholder}>
                    <Ionicons name="person" size={60} color={palette.textMuted} />
                    <Text style={styles.loadingImageText}>No image available</Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};

const createPalette = (themeColors, isDark) => ({
  background: themeColors.background,
  cardBackground: themeColors.cardBackground,
  textPrimary: themeColors.textPrimary,
  textSecondary: themeColors.textSecondary,
  textMuted: themeColors.textMuted,
  border: themeColors.border,
  primary: themeColors.primary,
  shadow: themeColors.shadow || '#000',
});

const createStyles = (palette, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: getResponsivePadding(20),
    paddingHorizontal: getResponsivePadding(20),
    paddingBottom: getResponsivePadding(20),
    backgroundColor: palette.background,
    minHeight: getResponsivePadding(60),
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: getResponsiveFontSize(18),
    fontWeight: '600',
    color: palette.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: palette.cardBackground,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: palette.border,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 5,
  },
  quickStatsSection: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 15,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: palette.cardBackground,
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: isDark ? 1 : 0,
    borderColor: palette.border,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  settingsSection: {
    backgroundColor: palette.cardBackground,
    borderRadius: 20,
    marginVertical: 10,
    paddingVertical: 10,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: isDark ? 1 : 0,
    borderColor: palette.border,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 15,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.textPrimary,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: palette.textSecondary,
  },
  // FIXED Square Image Viewer Modal Styles
  imageViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  squareModal: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.85,
    backgroundColor: palette.cardBackground,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.5 : 0.3,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: isDark ? 1 : 0,
    borderColor: palette.border,
  },
  squareModalImage: {
    width: '100%',
    height: '100%',
  },
  squareModalPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? '#1A1A1A' : '#F5F5F5',
  },
  loadingImageText: {
    marginTop: 12,
    fontSize: 14,
    color: palette.textSecondary,
  },
  editButtonInModal: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.5 : 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  editButtonTextInModal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
});

// Updated footerStyles for oval design with dark theme support
const createFooterStyles = (palette, isDark) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: getResponsivePadding(16),
    right: getResponsivePadding(16),
    backgroundColor: 'transparent',
    alignItems: 'center',
    zIndex: 100,
  },
  ovalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    backgroundColor: isDark ? 'rgba(30, 30, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 35,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: isDark ? 1 : 0,
    borderColor: palette.border,
    // Add backdrop filter effect for iOS
    ...(Platform.OS === 'ios' && {
      backgroundColor: isDark ? 'rgba(30, 30, 40, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'relative',
  },
  activeTab: {
    // Additional styling for active tab if needed
  },
  label: {
    fontSize: getResponsiveFontSize(12),
    marginTop: getResponsivePadding(4),
    color: palette.textSecondary,
    letterSpacing: 0.1,
    fontWeight: '500',
  },
  activeLabel: {
    color: palette.primary,
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 30,
    height: 3,
    backgroundColor: palette.primary,
    borderRadius: 2,
  },
});

export default React.memo(ProfileScreen);
