import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Image } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeInDown,
  Easing,
} from "react-native-reanimated";

const BRAND = {
  primary: "#03468F",
  primaryDark: "#20466F",
  background: "#F8FAFC",
  text: "#0F172A",
  textMuted: "#64748B",
};

export default function BootLoadingScreen() {
  // Breathing Animation for the Logo
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={styles.bootScreen}>
      <StatusBar style="dark" />
      
      {/* 1. Pulsing Brand Logo */}
      <Animated.View style={[styles.logoContainer, animatedLogoStyle]}>
        <Image 
          source={require("../../assets/icon.png")} 
          style={styles.logo} 
          resizeMode="contain" 
        />
      </Animated.View>

      {/* 2. App Name */}
      <Animated.View entering={FadeInDown.delay(200).springify().damping(14)}>
        <Text style={styles.appName}>AttendQR</Text>
      </Animated.View>

      {/* 3. Loading Indicator & Text */}
      <Animated.View entering={FadeIn.delay(500)} style={styles.loadingWrapper}>
        <ActivityIndicator size="small" color={BRAND.primary} style={styles.spinner} />
        <Text style={styles.subtitle}>Securing your session...</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BRAND.background,
  },
  logoContainer: {
    marginBottom: 20,
    shadowColor: BRAND.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: {
    width: 100,
    height: 100,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: BRAND.primaryDark,
    letterSpacing: -0.5,
    marginBottom: 40,
  },
  loadingWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  spinner: {
    marginRight: 10,
  },
  subtitle: {
    fontSize: 15,
    color: BRAND.textMuted,
    fontWeight: "600",
  },
});