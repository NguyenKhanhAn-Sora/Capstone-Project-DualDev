package com.example.cordigram_mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * Intercepts the cordigram:// OAuth callback from Chrome Custom Tab and forwards it
 * to MainActivity via onNewIntent. This causes Chrome to go to the background and
 * brings the Flutter app to the foreground, while letting flutter_web_auth_2's
 * onNewIntent handler resolve the pending authenticate() Future.
 */
class OAuthCallbackActivity : Activity() {
    companion object {
        private const val TAG = "OAuthCallback"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val callbackData = intent?.data
        Log.d(TAG, "=== OAuthCallbackActivity.onCreate ===")
        Log.d(TAG, "Received intent action: ${intent?.action}")
        Log.d(TAG, "Received callback URL: $callbackData")
        Log.d(TAG, "Callback scheme: ${callbackData?.scheme}")
        Log.d(TAG, "Callback host: ${callbackData?.host}")
        Log.d(TAG, "Callback query: ${callbackData?.query}")
        Log.d(TAG, "Task ID of OAuthCallbackActivity: $taskId")

        val forwardIntent = Intent(this, MainActivity::class.java).apply {
            action = intent.action
            data = intent.data
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        Log.d(TAG, "Forwarding to MainActivity with flags: ${forwardIntent.flags}")
        startActivity(forwardIntent)
        Log.d(TAG, "startActivity called, finishing OAuthCallbackActivity")
        finish()
    }
}
