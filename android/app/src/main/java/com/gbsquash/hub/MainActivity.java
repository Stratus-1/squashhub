package com.gbsquash.hub;

import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private final ActivityResultLauncher<String[]> requestPermissionsLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
                Log.d("MainActivity", "Permissions result: " + result);
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Handle the splash screen transition.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        
        super.onCreate(savedInstanceState);

        // Manually initialize Firebase to prevent the "FirebaseApp is not initialized" crash
        // in Capacitor PushNotifications plugin.
        try {
            FirebaseApp.initializeApp(this);
            Log.d("MainActivity", "Firebase initialized successfully");
        } catch (Exception e) {
            Log.e("MainActivity", "Firebase initialization failed", e);
        }
        
        checkAndRequestPermissions();
    }

    private void checkAndRequestPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();

        // Notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(android.Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            requestPermissionsLauncher.launch(permissionsNeeded.toArray(new String[0]));
        }
    }
}
