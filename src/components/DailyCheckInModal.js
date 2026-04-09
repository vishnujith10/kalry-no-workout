/**
 * DAILY CHECK-IN MODAL COMPONENT
 * Provides a user-friendly interface for daily check-in questions
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export const DailyCheckInModal = ({ 
  visible, 
  onClose, 
  onComplete, 
  userProfile 
}) => {
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState({});

  const questions = [
    {
      id: 'sleep',
      question: 'How many hours did you sleep last night?',
      type: 'number',
      range: [0, 12],
      default: 7,
      icon: '😴'
    },
    {
      id: 'energy',
      question: 'What\'s your energy level today?',
      type: 'select',
      options: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
      icon: '⚡'
    },
    {
      id: 'stress',
      question: 'How stressed do you feel?',
      type: 'select',
      options: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
      icon: '🧘‍♀️'
    },
    {
      id: 'mood',
      question: 'How\'s your mood today?',
      type: 'scale',
      range: [1, 10],
      labels: { 1: '😔 Low', 5: '😐 Neutral', 10: '😊 Great' },
      icon: '😊'
    },
    {
      id: 'situation',
      question: 'Anything special happening today?',
      type: 'multi-select',
      options: [
        'Normal day',
        'Feeling sick',
        'Traveling',
        'High stress/busy',
        'Period/PMS',
        'Special event/celebration',
        'Extra active day',
        'Working late'
      ],
      icon: '📅'
    }
  ];

  const currentQuestion = questions[currentQuestionIndex];

  const handleResponse = (value) => {
    setResponses(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    // Pass the raw responses to the completion callback
    // Let the parent component handle the processing
    onComplete(responses);
    
    // Reset for next time
    setCurrentQuestionIndex(0);
    setResponses({});
    onClose();
  };

  const renderQuestion = () => {
    const currentResponse = responses[currentQuestion.id];

    switch (currentQuestion.type) {
      case 'number':
        return (
          <View style={styles.numberInput}>
            <Text style={styles.numberValue}>
              {currentResponse || currentQuestion.default}
            </Text>
            <View style={styles.numberControls}>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => handleResponse(Math.max(0, (currentResponse || currentQuestion.default) - 0.5))}
              >
                <Ionicons name="remove" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => handleResponse(Math.min(12, (currentResponse || currentQuestion.default) + 0.5))}
              >
                <Ionicons name="add" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'select':
        return (
          <View style={styles.optionsContainer}>
            {currentQuestion.options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.optionButton,
                  currentResponse === option && styles.selectedOption
                ]}
                onPress={() => handleResponse(option)}
              >
                <Text style={[
                  styles.optionText,
                  currentResponse === option && styles.selectedOptionText
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'scale':
        return (
          <View style={styles.scaleContainer}>
            <Text style={styles.scaleLabel}>
              {currentQuestion.labels[1]} ← → {currentQuestion.labels[10]}
            </Text>
            <View style={styles.scaleButtons}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(value => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.scaleButton,
                    currentResponse === value && styles.selectedScaleButton
                  ]}
                  onPress={() => handleResponse(value)}
                >
                  <Text style={[
                    styles.scaleButtonText,
                    currentResponse === value && styles.selectedScaleButtonText
                  ]}>
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'multi-select':
        const selectedOptions = currentResponse || [];
        return (
          <View style={styles.optionsContainer}>
            {currentQuestion.options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.optionButton,
                  selectedOptions.includes(option) && styles.selectedOption
                ]}
                onPress={() => {
                  const newSelection = selectedOptions.includes(option)
                    ? selectedOptions.filter(opt => opt !== option)
                    : [...selectedOptions, option];
                  handleResponse(newSelection);
                }}
              >
                <Text style={[
                  styles.optionText,
                  selectedOptions.includes(option) && styles.selectedOptionText
                ]}>
                  {option}
                </Text>
                {selectedOptions.includes(option) && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    const currentResponse = responses[currentQuestion.id];
    if (currentQuestion.type === 'multi-select') {
      return Array.isArray(currentResponse) && currentResponse.length > 0;
    }
    return currentResponse !== undefined && currentResponse !== null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Daily Check-in</Text>
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {currentQuestionIndex + 1} of {questions.length}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }
                ]} 
              />
            </View>
          </View>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.questionContainer}>
            <Text style={styles.questionIcon}>{currentQuestion.icon}</Text>
            <Text style={styles.questionText}>{currentQuestion.question}</Text>
            {renderQuestion()}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom >= 20 ? (insets.bottom + 20) : 20 }]}>
          {currentQuestionIndex > 0 && (
            <TouchableOpacity
              style={styles.previousButton}
              onPress={handlePrevious}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
              <Text style={styles.previousButtonText}>Previous</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[
              styles.nextButton,
              !canProceed() && styles.nextButtonDisabled
            ]}
            onPress={handleNext}
            disabled={!canProceed()}
          >
            <Text style={[
              styles.nextButtonText,
              !canProceed() && styles.nextButtonTextDisabled
            ]}>
              {currentQuestionIndex === questions.length - 1 ? 'Complete' : 'Next'}
            </Text>
            {currentQuestionIndex < questions.length - 1 && (
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors, isDark) => {
  const palette = {
    background: colors.background,
    card: colors.cardBackground,
    primary: colors.primary,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    border: colors.border,
    highlight: isDark ? '#1F1F2E' : '#F8F9FF',
    pressed: isDark ? '#27283A' : '#F0F4FF',
    disabledBg: isDark ? '#2A2A3E' : '#E2E8F0',
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    closeButton: {
      position: 'absolute',
      top: 20,
      right: 20,
      zIndex: 1,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: palette.textPrimary,
      textAlign: 'center',
      marginBottom: 16,
    },
    progressContainer: {
      alignItems: 'center',
    },
    progressText: {
      fontSize: 14,
      color: palette.textSecondary,
      marginBottom: 8,
    },
    progressBar: {
      width: '100%',
      height: 4,
      backgroundColor: palette.border,
      borderRadius: 2,
    },
    progressFill: {
      height: '100%',
      backgroundColor: palette.primary,
      borderRadius: 2,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    questionContainer: {
      paddingVertical: 32,
      alignItems: 'center',
    },
    questionIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    questionText: {
      fontSize: 20,
      fontWeight: '600',
      color: palette.textPrimary,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 28,
    },
    numberInput: {
      alignItems: 'center',
    },
    numberValue: {
      fontSize: 48,
      fontWeight: '700',
      color: palette.primary,
      marginBottom: 16,
    },
    numberControls: {
      flexDirection: 'row',
      gap: 16,
    },
    numberButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: palette.highlight,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: palette.primary,
    },
    optionsContainer: {
      width: '100%',
      gap: 12,
    },
    optionButton: {
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: palette.highlight,
      borderWidth: 2,
      borderColor: palette.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectedOption: {
      backgroundColor: palette.pressed,
      borderColor: palette.primary,
    },
    optionText: {
      fontSize: 16,
      color: palette.textPrimary,
      fontWeight: '500',
    },
    selectedOptionText: {
      color: palette.primary,
      fontWeight: '600',
    },
    scaleContainer: {
      width: '100%',
      alignItems: 'center',
    },
    scaleLabel: {
      fontSize: 14,
      color: palette.textSecondary,
      marginBottom: 16,
    },
    scaleButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
    },
    scaleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.highlight,
      borderWidth: 2,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedScaleButton: {
      backgroundColor: palette.primary,
      borderColor: palette.primary,
    },
    scaleButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: palette.textPrimary,
    },
    selectedScaleButtonText: {
      color: '#FFFFFF',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 20,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    previousButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    previousButtonText: {
      fontSize: 16,
      color: palette.primary,
      fontWeight: '600',
      marginLeft: 4,
    },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
      flex: 1,
      justifyContent: 'center',
      marginLeft: 16,
    },
    nextButtonDisabled: {
      backgroundColor: palette.disabledBg,
    },
    nextButtonText: {
      fontSize: 16,
      color: '#FFFFFF',
      fontWeight: '600',
      marginRight: 4,
    },
    nextButtonTextDisabled: {
      color: palette.textMuted,
    },
  });
};
