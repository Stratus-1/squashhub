# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep source/line info for better crash traces (and for Play deobfuscation).
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*

# Capacitor / Cordova (avoid stripping plugin entrypoints used by reflection/bridging).
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
