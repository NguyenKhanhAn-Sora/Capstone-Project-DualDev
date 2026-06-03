package com.example.cordigram_mobile

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.util.Rational
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.android.RenderMode
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val PIP_CHANNEL = "com.example.cordigram_mobile/pip"
    private var callActive = false

    override fun getRenderMode(): RenderMode = RenderMode.texture

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, PIP_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "enterPiP" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            try {
                                val params = PictureInPictureParams.Builder()
                                    .setAspectRatio(Rational(9, 16))
                                    .build()
                                enterPictureInPictureMode(params)
                                result.success(true)
                            } catch (e: Exception) {
                                result.success(false)
                            }
                        } else {
                            result.success(false)
                        }
                    }
                    "setCallActive" -> {
                        callActive = call.arguments as? Boolean ?: false
                        result.success(null)
                    }
                    "isInPiPMode" -> {
                        val inPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            isInPictureInPictureMode
                        } else {
                            false
                        }
                        result.success(inPip)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    /** Auto-enter PiP when user presses Home while a call is active. */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!callActive) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(9, 16))
                    .build()
                enterPictureInPictureMode(params)
            } catch (_: Exception) {}
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // Flutter side listens via AppLifecycleState; no extra work needed here.
    }
}
