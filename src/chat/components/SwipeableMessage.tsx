import React, { useRef } from "react";
import { Animated, PanResponder, View, StyleSheet } from "react-native";
import { CornerDownLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";

type SwipeableMessageProps = {
  item: any;
  onReply: (msg: any) => void;
  children: React.ReactNode;
  replyIconColor: string;
};

export function SwipeableMessage({
  item,
  onReply,
  children,
  replyIconColor,
}: SwipeableMessageProps) {
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gestureState) => {
        return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderMove: (_e, gestureState) => {
        if (gestureState.dx < 0 && gestureState.dx > -60) {
          pan.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_e, gestureState) => {
        if (gestureState.dx < -40) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onReply(item);
        }
        Animated.spring(pan, { toValue: 0, useNativeDriver: true, friction: 5 }).start();
      },
    }),
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <Animated.View
        style={[
          styles.swipeableIcon,
          {
            opacity: pan.interpolate({
              inputRange: [-60, 0],
              outputRange: [1, 0],
            }),
          },
        ]}
      >
        <CornerDownLeft color={replyIconColor} size={20} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: pan }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: { flexDirection: "row", alignItems: "center" },
  swipeableIcon: { position: "absolute", right: 20, zIndex: -1 },
});
