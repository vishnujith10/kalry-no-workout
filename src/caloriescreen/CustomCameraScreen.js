import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

export default function CustomCameraScreen({ navigation }) {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isGalleryActive, setIsGalleryActive] = useState(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    // Scanning animation with smooth easing
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Pulse animation for capture button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [scanAnim, pulseAnim, glowAnim]);

  const handleCapture = async () => {
    if (cameraRef.current && isCameraReady) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        navigation.replace('PhotoCalorieScreen', { photoUri: photo.uri, mealType: 'Quick Log' });
      } catch (_error) {
        Alert.alert('Error', 'Could not take photo.');
      }
    }
  };

  const handleOpenGallery = async () => {
    try {
      setIsGalleryActive(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        navigation.replace('PhotoCalorieScreen', {
          photoUri: result.assets[0].uri,
          mealType: 'Quick Log',
        });
      } else {
        setIsGalleryActive(false);
      }
    } catch (_error) {
      Alert.alert('Error', 'Could not open gallery.');
      setIsGalleryActive(false);
    }
  };

  if (!permission) {
    return <View style={styles.loadingContainer} />;
  }
  
  // Show loading screen when gallery is active to prevent camera flash
  if (isGalleryActive) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingText}>Opening Gallery...</Text>
        </View>
      </View>
    );
  }
  
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar style="auto" />
        <View style={styles.permissionCard}>
          <Ionicons name="camera" size={60} color="#C084FC" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>Allow camera access to scan food items</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Enhanced scanning animations
  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [120, height - 220],
  });

  const scanLineOpacity = scanAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.8],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
      >
        {/* Top gradient overlay */}
        <View style={styles.topGradient} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Food</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Scanning frame */}
        <View style={styles.scanFrame}>
          <View style={styles.frameCorner} />
          <View style={[styles.frameCorner, styles.frameCornerTopRight]} />
          <View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
          <View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
          
          {/* Enhanced scanning line with glow */}
          <Animated.View
            style={[
              styles.scanLine,
              {
                opacity: scanLineOpacity,
                transform: [{ translateY: scanLineY }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.scanGlow,
              {
                opacity: glowOpacity,
                transform: [{ translateY: scanLineY }],
              },
            ]}
          />
        </View>

        {/* Instruction text */}
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>Position food within the frame</Text>
          <Text style={styles.instructionSubText}>Move closer for better accuracy</Text>
        </View>

        {/* Bottom gradient overlay */}
        <View style={[styles.bottomGradient, { bottom: -insets.bottom }]} />
        
        {/* Enhanced bottom controls */}
        <View style={[styles.bottomControls, { bottom: insets.bottom >= 20 ? insets.bottom : 0, paddingBottom: insets.bottom >= 20 ? (insets.bottom + 40) : 40 }]}>
          <View style={styles.controlsContainer}>
            <TouchableOpacity onPress={handleOpenGallery} style={styles.galleryButton}>
              <View style={styles.galleryIconContainer}>
                <Ionicons name="images" size={24} color="#fff" />
              </View>
              <Text style={styles.buttonLabel}>Gallery</Text>
            </TouchableOpacity>
            
            <View style={styles.captureContainer}>
              <Animated.View
                style={[
                  styles.captureButtonOuter,
                  {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              >
                <TouchableOpacity onPress={handleCapture} style={styles.captureButton}>
                  <View style={styles.captureButtonInner}>
                    <Ionicons name="camera" size={32} color="#C084FC" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
            
            <TouchableOpacity style={styles.flashButton}>
              <View style={styles.flashIconContainer}>
                <Ionicons name="flash-off" size={24} color="#fff" />
              </View>
              <Text style={styles.buttonLabel}>Flash</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#C084FC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    width: 44,
  },
  scanFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: width * 0.8,
    height: width * 0.8,
    marginLeft: -(width * 0.4),
    marginTop: -(width * 0.4),
    borderRadius: 24,
  },
  frameCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#C084FC',
    borderRadius: 8,
    top: 0,
    left: 0,
  },
  frameCornerTopRight: {
    top: 0,
    right: 0,
    left: 'auto',
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderLeftWidth: 0,
  },
  frameCornerBottomLeft: {
    bottom: 0,
    left: 0,
    top: 'auto',
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderTopWidth: 0,
  },
  frameCornerBottomRight: {
    bottom: 0,
    right: 0,
    top: 'auto',
    left: 'auto',
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#C084FC',
    borderRadius: 2,
    shadowColor: '#C084FC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  scanGlow: {
    position: 'absolute',
    left: -10,
    right: -10,
    height: 20,
    backgroundColor: '#C084FC',
    borderRadius: 10,
    opacity: 0.3,
    shadowColor: '#C084FC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  instructionContainer: {
    position: 'absolute',
    bottom: 200,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  instructionSubText: {
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 20,
    zIndex: 10,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  galleryButton: {
    alignItems: 'center',
  },
  galleryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  flashButton: {
    alignItems: 'center',
  },
  flashIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttonLabel: {
    fontSize: 12,
    color: '#B0B0B0',
    marginTop: 8,
    fontWeight: '500',
  },
  captureContainer: {
    alignItems: 'center',
  },
  captureButtonOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(192,132,252,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#C084FC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#C084FC',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#C084FC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});