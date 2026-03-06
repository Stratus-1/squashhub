package com.gbsquash.hub;

import android.app.Application;
import android.util.Log;
import com.google.firebase.FirebaseApp;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Initialize Firebase as early as possible (in the Application class)
        // to prevent crashes in Capacitor plugins.
        try {
            FirebaseApp.initializeApp(this);
            Log.d("MainApplication", "Firebase initialized successfully in Application class");
        } catch (Exception e) {
            Log.e("MainApplication", "Firebase initialization failed. Make sure google-services.json is in the app/ folder.", e);
        }
    }
}
