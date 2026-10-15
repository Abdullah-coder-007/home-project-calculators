package com.calcupine.measure

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/** Draws the aiming circle, the points, the lines between them and their lengths. */
class MeasureOverlay @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {

    /** Set by the activity on every frame (GL thread), drawn on the UI thread. */
    @Volatile var viewProj: FloatArray? = null
    @Volatile var aimHit: Vec3? = null
    @Volatile var points: List<Vec3> = emptyList()
    @Volatile var heightTop: Vec3? = null
    @Volatile var imperial: Boolean = true
    @Volatile var tracking: Boolean = false

    private val density = resources.displayMetrics.density
    private val accent = Color.parseColor("#F2367C")
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; strokeWidth = 4f * density; style = Paint.Style.STROKE }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent; style = Paint.Style.FILL }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; strokeWidth = 3f * density; style = Paint.Style.STROKE }
    private val labelBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#E61B1640") }
    private val labelText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; textSize = 16f * density; isFakeBoldText = true; textAlign = Paint.Align.CENTER
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val vp = viewProj ?: return
        val w = width; val h = height
        val pts = points

        // Lines between the floor points with their lengths.
        for (i in 1 until pts.size) {
            drawSegment(canvas, pts[i - 1], pts[i], vp, w, h, Geometry.floorDistance(pts[i - 1], pts[i]))
        }
        // Height line from the last floor point.
        val top = heightTop
        if (top != null && pts.isNotEmpty()) {
            drawSegment(canvas, pts.last(), top, vp, w, h, top.y - pts.last().y)
        }
        // Live line from the last point to where the phone is aiming.
        val aim = aimHit
        if (aim != null && pts.isNotEmpty() && pts.size < 3 && top == null) {
            drawSegment(canvas, pts.last(), aim, vp, w, h, Geometry.floorDistance(pts.last(), aim))
        }
        for (p in pts) {
            val s = Geometry.project(p, vp, w, h) ?: continue
            canvas.drawCircle(s[0], s[1], 7f * density, dot)
        }
        // Aiming circle in the middle of the screen.
        ring.color = if (tracking && aim != null) Color.WHITE else Color.parseColor("#80FFFFFF")
        canvas.drawCircle(w / 2f, h / 2f, 18f * density, ring)
        canvas.drawCircle(w / 2f, h / 2f, 3f * density, ring)
    }

    private fun drawSegment(c: Canvas, a: Vec3, b: Vec3, vp: FloatArray, w: Int, h: Int, metres: Float) {
        val sa = Geometry.project(a, vp, w, h) ?: return
        val sb = Geometry.project(b, vp, w, h) ?: return
        c.drawLine(sa[0], sa[1], sb[0], sb[1], line)
        val text = if (imperial) Geometry.formatImperial(metres) else Geometry.formatMetric(metres)
        val mx = (sa[0] + sb[0]) / 2f
        val my = (sa[1] + sb[1]) / 2f
        val tw = labelText.measureText(text) / 2f + 10f * density
        c.drawRoundRect(RectF(mx - tw, my - 18f * density, mx + tw, my + 10f * density), 12f * density, 12f * density, labelBg)
        c.drawText(text, mx, my + 2f * density, labelText)
    }
}
