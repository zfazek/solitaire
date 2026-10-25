package com.ongroa.solitaire;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Card text is laid out from CSS lengths derived from the viewport width.
        // The system "font size" accessibility setting applies a WebView text
        // zoom that inflates text independently of those lengths, causing the
        // corner labels to overlap. Pin the WebView text zoom to 100% so the
        // layout is immune to the system font-size / bold-text settings.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }

    @Override
    protected void attachBaseContext(Context newBase) {
        // Neutralize the system font scale for the whole activity so no view
        // (including the WebView) is scaled by the device's font-size setting.
        Configuration configuration = new Configuration(newBase.getResources().getConfiguration());
        configuration.fontScale = 1.0f;
        Context context = newBase.createConfigurationContext(configuration);
        super.attachBaseContext(context);
    }
}
