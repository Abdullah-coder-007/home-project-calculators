package com.calcupine.measure

import android.opengl.Matrix
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** A point in ARCore world space, in metres. Y is up. */
data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun times(s: Float) = Vec3(x * s, y * s, z * s)
    fun dot(o: Vec3) = x * o.x + y * o.y + z * o.z
    fun length() = sqrt(x * x + y * y + z * z)
    fun horizontal() = Vec3(x, 0f, z)
    fun normalized(): Vec3 { val l = length(); return if (l < 1e-6f) this else this * (1f / l) }
}

object Geometry {
    /** Distance along the floor (ignores small height differences between taps). */
    fun floorDistance(a: Vec3, b: Vec3): Float = (b - a).horizontal().length()

    /** World point -> screen pixels, or null if behind the camera. */
    fun project(p: Vec3, viewProj: FloatArray, w: Int, h: Int): FloatArray? {
        val v = floatArrayOf(p.x, p.y, p.z, 1f)
        val out = FloatArray(4)
        Matrix.multiplyMV(out, 0, viewProj, 0, v, 0)
        if (out[3] <= 1e-4f) return null
        val nx = out[0] / out[3]
        val ny = out[1] / out[3]
        return floatArrayOf((nx + 1f) / 2f * w, (1f - ny) / 2f * h)
    }

    /** Ray from the camera through a screen pixel: origin and direction in world space. */
    fun screenRay(sx: Float, sy: Float, w: Int, h: Int, viewProj: FloatArray): Pair<Vec3, Vec3>? {
        val inv = FloatArray(16)
        if (!Matrix.invertM(inv, 0, viewProj, 0)) return null
        val nx = sx / w * 2f - 1f
        val ny = 1f - sy / h * 2f
        val near = unproject(inv, nx, ny, -1f)
        val far = unproject(inv, nx, ny, 1f)
        return Pair(near, (far - near).normalized())
    }

    private fun unproject(inv: FloatArray, nx: Float, ny: Float, nz: Float): Vec3 {
        val out = FloatArray(4)
        Matrix.multiplyMV(out, 0, inv, 0, floatArrayOf(nx, ny, nz, 1f), 0)
        return Vec3(out[0] / out[3], out[1] / out[3], out[2] / out[3])
    }

    /**
     * Height above a floor point, from where the finger is on screen: the ray through the
     * finger meets an upright plane through the floor point that faces the camera.
     */
    fun heightAt(base: Vec3, cameraPos: Vec3, rayOrigin: Vec3, rayDir: Vec3): Float? {
        val normal = (cameraPos - base).horizontal().normalized()
        val denom = rayDir.dot(normal)
        if (abs(denom) < 1e-4f) return null
        val t = (base - rayOrigin).dot(normal) / denom
        if (t <= 0f) return null
        val hit = rayOrigin + rayDir * t
        return (hit.y - base.y).coerceIn(0f, 12f)
    }

    fun formatMetric(m: Float): String = String.format("%.2f m", m)

    fun formatImperial(m: Float): String {
        val totalIn = (m / 0.0254f * 2f).roundToInt() / 2f   // nearest half inch
        val ft = floor(totalIn / 12f).toInt()
        val inch = totalIn - ft * 12
        val inchText = if (inch % 1f == 0f) inch.toInt().toString() else String.format("%.1f", inch)
        return "$ft ft $inchText in"
    }
}
