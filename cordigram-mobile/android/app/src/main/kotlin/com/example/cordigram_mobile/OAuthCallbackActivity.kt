package com.example.cordigram_mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Intercepts the cordigram:// OAuth callback from Chrome Custom Tab and forwards it
 * to MainActivity via onNewIntent. This causes Chrome to go to the background and
 * brings the Flutter app to the foreground, while letting flutter_web_auth_2's
 * onNewIntent handler resolve the pending authenticate() Future.
 */
class OAuthCallbackActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val forwardIntent = Intent(this, MainActivity::class.java).apply {
            action = intent.action
            data = intent.data
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(forwardIntent)
        finish()
    }
}
