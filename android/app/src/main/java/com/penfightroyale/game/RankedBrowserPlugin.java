package com.penfightroyale.game;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RankedBrowser")
public class RankedBrowserPlugin extends Plugin {
    @Override
    protected void handleOnResume() {
        notifyListeners("returnToGame", new JSObject());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        Uri uri = intent.getData();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && uri != null
                && "penfightaurawars".equals(uri.getScheme()) && "ranked-auth".equals(uri.getHost())
                && "/complete".equals(uri.getPath())) {
            // The link wakes up the existing check. Only the server can issue a session.
            notifyListeners("returnToGame", new JSObject());
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null
                || uri.getPath() == null || !uri.getPath().startsWith("/api/online/auth/google/start/")) {
            call.reject("Invalid sign-in address");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No browser is available", error);
        }
    }
}
