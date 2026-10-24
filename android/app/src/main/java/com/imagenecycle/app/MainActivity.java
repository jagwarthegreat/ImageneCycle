package com.imagenecycle.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundLocationPlugin.class);
        registerPlugin(AntPlusSensorsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
