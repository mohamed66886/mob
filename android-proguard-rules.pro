# Keep all Expo module classes
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# Keep React Native classes
-keep class com.facebook.** { *; }
-dontwarn com.facebook.**

# Keep WebRTC classes
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# Keep Lottie classes
-keep class com.airbnb.lottie.** { *; }
-dontwarn com.airbnb.lottie.**

# Keep Reanimated
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.swmansion.reanimated.**

# Keep react-native-pdf
-keep class com.github.nickhol.pdfviewer.** { *; }
-dontwarn com.github.nickhol.pdfviewer.**
