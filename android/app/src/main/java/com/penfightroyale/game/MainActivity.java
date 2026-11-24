package com.penfightroyale.game;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RankedBrowserPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
