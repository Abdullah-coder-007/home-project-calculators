package com.calcupine.measure

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.tan

/**
 * Tilt measuring, for phones without Google Play Services for AR.
 *
 * Holding the phone at a known height h, aiming the crosshair at the line where a wall
 * meets the floor gives the distance to that wall: d = h x tan(angle from straight down).
 * Aiming at the top of the same wall gives its height: h + d x tan(angle above level).
 *
 * Room flow: stand with your back against one wall.
 *  1. Aim at the bottom of the wall in front of you -> length.
 *  2. Turn 90 degrees (back against the side wall), aim at the bottom of the opposite wall -> width.
 *  3. Without moving, aim at the top of that same wall -> height.
 * Typical accuracy is within about 5%, best with the phone held steady at the set height.
 */
class TiltActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var sensors: SensorManager
    private var rotation: Sensor? = null
    private val rot = FloatArray(9)
    @Volatile private var downAngle = Double.NaN      // radians from straight down, smoothed

    private lateinit var prompt: TextView
    private lateinit var live: TextView
    private lateinit var heightLabel: TextView
    private lateinit var capture: Button
    private lateinit var undoBtn: Button
    private lateinit var unitsBtn: Button
    private lateinit var sendBtn: Button

    private var phoneHeight = 1.40f    // metres, set by the slider
    private val results = mutableListOf<Float>()   // length, width, height in metres
    private var lastDistance = 0f
    private var imperial = true
    private var returnPath = "/paint-calculator/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_tilt)
        prompt = findViewById(R.id.tilt_prompt)
        live = findViewById(R.id.tilt_live)
        heightLabel = findViewById(R.id.tilt_height_label)
        capture = findViewById(R.id.tilt_capture)
        undoBtn = findViewById(R.id.tilt_undo)
        unitsBtn = findViewById(R.id.tilt_units)
        sendBtn = findViewById(R.id.tilt_send)

        imperial = intent.getBooleanExtra("imperial", true)
        intent.getStringExtra("return")?.let { if (Regex("^/[a-z0-9-]+/$").matches(it)) returnPath = it }

        sensors = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        rotation = sensors.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

        val slider = findViewById<SeekBar>(R.id.tilt_height)
        slider.max = 100                       // 0.90 m to 1.90 m
        slider.progress = ((phoneHeight - 0.9f) * 100).toInt()
        slider.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) { phoneHeight = 0.9f + p / 100f; refresh() }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })

        capture.setOnClickListener { captureNow() }
        undoBtn.setOnClickListener { if (results.isNotEmpty()) results.removeAt(results.size - 1); refresh() }
        unitsBtn.setOnClickListener { imperial = !imperial; refresh() }
        sendBtn.setOnClickListener { send() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera()
        else ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 2)
        if (rotation == null) Toast.makeText(this, getString(R.string.tilt_no_sensor), Toast.LENGTH_LONG).show()
        refresh()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) startCamera()
        else { Toast.makeText(this, getString(R.string.camera_needed), Toast.LENGTH_LONG).show(); finish() }
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(findViewById<PreviewView>(R.id.tilt_preview).surfaceProvider)
            }
            provider.unbindAll()
            provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview)
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onResume() {
        super.onResume()
        rotation?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onPause() {
        super.onPause()
        sensors.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rot, event.values)
        // The back camera looks along the phone's -Z axis. In world coordinates (Z up) that is
        // -(rot[2], rot[5], rot[8]); its angle from straight down is acos(rot[8]).
        val a = acos(rot[8].toDouble().coerceIn(-1.0, 1.0))
        downAngle = if (downAngle.isNaN()) a else downAngle * 0.85 + a * 0.15
        runOnUiThread { showLive() }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun distanceNow(): Float? {
        val a = downAngle
        if (a.isNaN() || a >= PI / 2 - 0.03) return null          // aiming at or above the horizon
        return (phoneHeight * tan(a)).toFloat().coerceAtMost(30f)
    }

    private fun heightNow(): Float? {
        val a = downAngle
        if (a.isNaN() || lastDistance <= 0f) return null
        val up = a - PI / 2                                         // angle above level
        return (phoneHeight + lastDistance * tan(up)).toFloat().coerceIn(0f, 12f)
    }

    private fun showLive() {
        val v = if (results.size < 2) distanceNow() else if (results.size == 2) heightNow() else null
        live.text = v?.let { fmt(it) } ?: if (results.size >= 3) "" else getString(R.string.tilt_aim_lower)
    }

    private fun captureNow() {
        when (results.size) {
            0, 1 -> {
                val d = distanceNow() ?: return toast(R.string.tilt_aim_lower)
                // Standing with your back to the wall, the phone is about 25 cm in front of it.
                val total = d + 0.25f
                results.add(total)
                lastDistance = d
            }
            2 -> {
                val h = heightNow() ?: return toast(R.string.tilt_aim_top)
                results.add(h)
            }
        }
        refresh()
    }

    private fun toast(id: Int) { Toast.makeText(this, getString(id), Toast.LENGTH_SHORT).show() }

    private fun fmt(m: Float) = if (imperial) Geometry.formatImperial(m) else Geometry.formatMetric(m)

    private fun refresh() {
        heightLabel.text = getString(R.string.tilt_phone_height, fmt(phoneHeight))
        unitsBtn.text = getString(if (imperial) R.string.units_imperial else R.string.units_metric)
        prompt.text = when (results.size) {
            0 -> getString(R.string.tilt_step_1)
            1 -> getString(R.string.tilt_step_2, fmt(results[0]))
            2 -> getString(R.string.tilt_step_3, fmt(results[0]), fmt(results[1]))
            else -> getString(R.string.tilt_done, fmt(results[0]), fmt(results[1]), fmt(results[2]))
        }
        capture.isEnabled = results.size < 3
        capture.alpha = if (results.size < 3) 1f else 0.4f
        undoBtn.isEnabled = results.isNotEmpty()
        sendBtn.isEnabled = results.size >= 2
        sendBtn.alpha = if (results.size >= 2) 1f else 0.4f
        showLive()
    }

    private fun send() {
        val l = results.getOrElse(0) { 0f }; val w = results.getOrElse(1) { 0f }; val h = results.getOrElse(2) { 0f }
        val value = listOf(l, w, h).joinToString(",") { String.format(java.util.Locale.US, "%.3f", it) }
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://calcupine.com$returnPath?measure=$value")))
    }
}
