package com.calcupine.measure

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.os.Bundle
import android.view.MotionEvent
import android.view.Surface
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableException
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * Calcupine Measure: length, width and height of a room in one go.
 *
 * 1. Aim at a floor corner and tap "Add point" (start of the length).
 * 2. Aim at the next corner along the wall and tap "Add point" (length).
 * 3. Aim at the corner across the room and tap "Add point" (width).
 * 4. Slide a finger up the screen until the line reaches the ceiling (height), then "Done".
 * 5. "Send to calculator" opens calcupine.com with the three numbers filled in.
 */
class MainActivity : AppCompatActivity(), GLSurfaceView.Renderer {

    private var session: Session? = null
    private var installRequested = false
    private val background = BackgroundRenderer()

    private lateinit var surface: GLSurfaceView
    private lateinit var overlay: MeasureOverlay
    private lateinit var prompt: TextView
    private lateinit var addButton: Button
    private lateinit var undoButton: Button
    private lateinit var unitsButton: Button
    private lateinit var sendButton: Button

    private var viewW = 1
    private var viewH = 1
    private val viewMatrix = FloatArray(16)
    private val projMatrix = FloatArray(16)
    @Volatile private var lastViewProj: FloatArray? = null
    @Volatile private var cameraPos: Vec3? = null
    @Volatile private var aimHit: Vec3? = null

    private val points = mutableListOf<Vec3>()
    private var heightTop: Vec3? = null
    private var heightDone = false
    private var imperial = true
    private var returnPath = "/paint-calculator/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        surface = findViewById(R.id.surface)
        overlay = findViewById(R.id.overlay)
        prompt = findViewById(R.id.prompt)
        addButton = findViewById(R.id.add_point)
        undoButton = findViewById(R.id.undo)
        unitsButton = findViewById(R.id.units)
        sendButton = findViewById(R.id.send)

        surface.preserveEGLContextOnPause = true
        surface.setEGLContextClientVersion(2)
        surface.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        surface.setRenderer(this)
        surface.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY

        imperial = resources.configuration.locales[0].country in setOf("US", "CA", "IN", "LR", "MM")
        readIntent(intent)

        addButton.setOnClickListener { addPoint() }
        undoButton.setOnClickListener { undo() }
        unitsButton.setOnClickListener { imperial = !imperial; refresh() }
        sendButton.setOnClickListener { send() }
        setupHeightDrag()
        refresh()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        readIntent(intent)
    }

    /** calcupine://measure?return=/flooring-calculator/ tells us which calculator to go back to. */
    private fun readIntent(intent: Intent?) {
        val ret = intent?.data?.getQueryParameter("return") ?: return
        if (Regex("^/[a-z0-9-]+/$").matches(ret)) returnPath = ret
    }

    override fun onResume() {
        super.onResume()
        if (!hasCamera()) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1)
            return
        }
        if (session == null) {
            try {
                when (ArCoreApk.getInstance().requestInstall(this, !installRequested)) {
                    ArCoreApk.InstallStatus.INSTALL_REQUESTED -> { installRequested = true; return }
                    else -> {}
                }
                val s = Session(this)
                val config = Config(s).apply {
                    planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                    focusMode = Config.FocusMode.AUTO
                    updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                    if (s.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) depthMode = Config.DepthMode.AUTOMATIC
                }
                s.configure(config)
                session = s
            } catch (e: UnavailableException) {
                Toast.makeText(this, getString(R.string.ar_unavailable), Toast.LENGTH_LONG).show()
                finish(); return
            }
        }
        try {
            session?.resume()
        } catch (e: CameraNotAvailableException) {
            Toast.makeText(this, getString(R.string.camera_unavailable), Toast.LENGTH_LONG).show()
            session = null; return
        }
        surface.onResume()
    }

    override fun onPause() {
        super.onPause()
        surface.onPause()
        session?.pause()
    }

    override fun onDestroy() {
        session?.close()
        session = null
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (!hasCamera()) {
            Toast.makeText(this, getString(R.string.camera_needed), Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun hasCamera() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    // ---------------- GL thread ----------------

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        background.createOnGlThread()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
        viewW = width; viewH = height
        session?.setDisplayGeometry(Surface.ROTATION_0, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        val s = session ?: return
        s.setCameraTextureName(background.textureId)
        s.setDisplayGeometry(Surface.ROTATION_0, viewW, viewH)
        val frame: Frame = try { s.update() } catch (e: Exception) { return }
        background.draw(frame)

        val camera = frame.camera
        val tracking = camera.trackingState == TrackingState.TRACKING
        if (tracking) {
            camera.getViewMatrix(viewMatrix, 0)
            camera.getProjectionMatrix(projMatrix, 0, 0.05f, 50f)
            val vp = FloatArray(16)
            Matrix.multiplyMM(vp, 0, projMatrix, 0, viewMatrix, 0)
            lastViewProj = vp
            val cp = camera.pose
            cameraPos = Vec3(cp.tx(), cp.ty(), cp.tz())
            aimHit = centerHit(frame)
        }
        overlay.viewProj = lastViewProj
        overlay.aimHit = aimHit
        overlay.tracking = tracking
        overlay.postInvalidate()
    }

    /** What the aiming circle is on: a detected floor or wall, or a depth point. */
    private fun centerHit(frame: Frame): Vec3? {
        for (hit in frame.hitTest(viewW / 2f, viewH / 2f)) {
            val t = hit.trackable
            val ok = when (t) {
                is Plane -> t.isPoseInPolygon(hit.hitPose) && t.trackingState == TrackingState.TRACKING
                is DepthPoint -> true
                is Point -> t.orientationMode == Point.OrientationMode.ESTIMATED_SURFACE_NORMAL
                else -> false
            }
            if (ok) {
                val p = hit.hitPose
                return Vec3(p.tx(), p.ty(), p.tz())
            }
        }
        return null
    }

    // ---------------- UI thread ----------------

    private fun addPoint() {
        if (points.size >= 3) return
        val hit = aimHit
        if (hit == null) {
            Toast.makeText(this, getString(R.string.aim_floor), Toast.LENGTH_SHORT).show()
            return
        }
        points.add(hit)
        refresh()
    }

    private fun undo() {
        when {
            heightDone -> { heightDone = false }
            heightTop != null -> heightTop = null
            points.isNotEmpty() -> points.removeAt(points.size - 1)
        }
        refresh()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupHeightDrag() {
        overlay.setOnTouchListener { _, ev ->
            if (points.size < 3 || heightDone) return@setOnTouchListener false
            if (ev.action == MotionEvent.ACTION_DOWN || ev.action == MotionEvent.ACTION_MOVE) {
                val vp = lastViewProj
                val cam = cameraPos
                if (vp != null && cam != null) {
                    val ray = Geometry.screenRay(ev.x, ev.y, overlay.width, overlay.height, vp)
                    val base = points.last()
                    if (ray != null) {
                        val hgt = Geometry.heightAt(base, cam, ray.first, ray.second)
                        if (hgt != null) { heightTop = Vec3(base.x, base.y + hgt, base.z); refresh() }
                    }
                }
            }
            true
        }
    }

    private fun lengthM() = if (points.size >= 2) Geometry.floorDistance(points[0], points[1]) else 0f
    private fun widthM() = if (points.size >= 3) Geometry.floorDistance(points[1], points[2]) else 0f
    private fun heightM() = heightTop?.let { it.y - points.last().y } ?: 0f

    private fun fmt(m: Float) = if (imperial) Geometry.formatImperial(m) else Geometry.formatMetric(m)

    private fun refresh() {
        overlay.points = points.toList()
        overlay.heightTop = heightTop
        overlay.imperial = imperial
        unitsButton.text = getString(if (imperial) R.string.units_imperial else R.string.units_metric)
        undoButton.isEnabled = points.isNotEmpty()
        prompt.text = when (points.size) {
            0 -> getString(R.string.step_1)
            1 -> getString(R.string.step_2)
            2 -> getString(R.string.step_3, fmt(lengthM()))
            else -> if (heightTop == null) getString(R.string.step_4, fmt(lengthM()), fmt(widthM()))
                    else getString(R.string.step_5, fmt(lengthM()), fmt(widthM()), fmt(heightM()))
        }
        addButton.isEnabled = points.size < 3
        addButton.alpha = if (points.size < 3) 1f else 0.4f
        sendButton.isEnabled = points.size >= 2
        sendButton.alpha = if (points.size >= 2) 1f else 0.4f
    }

    /** Opens the calculator with ?measure=length,width,height in metres (3 decimals). */
    private fun send() {
        val l = lengthM(); val w = widthM(); val h = heightM()
        val value = listOf(l, w, h).joinToString(",") { String.format(java.util.Locale.US, "%.3f", it) }
        val uri = Uri.parse("https://calcupine.com$returnPath?measure=$value")
        startActivity(Intent(Intent.ACTION_VIEW, uri))
    }
}
