// The instrument.
//
// Measures what a person actually waits for: the time between an input event
// and the pixels changing in response to it. It knows nothing about the app
// under test — no hooks, no instrumentation, no cooperation — which is the
// only way to put two different mail clients in the same table.
//
//   swiftc -O harness/measure.swift -o harness/bin/measure
//
//   harness/bin/measure --app com.apple.mail \
//                   --region 700,200,900,700 \
//                   --click 400,300 \
//                   --runs 10
//
// Two numbers come back per run:
//
//   first   the first captured frame whose watched region differs from the
//           baseline. "Something happened."
//   settle  the first frame after which the region stays identical for
//           `--settle-frames`. "It finished happening."
//
// Both matter. A client that paints a spinner in 16ms and the message in
// 900ms has a good `first` and a bad `settle`, and quoting only the first
// would be a way of lying with a true number.
//
// PERMISSIONS. This needs Screen Recording (to capture) and Accessibility (to
// post events), granted once by hand to whatever runs it — Terminal, or the
// binary itself. Both prompt on first use.

import AVFoundation
import AppKit
import CoreGraphics
import Foundation
import ScreenCaptureKit

// MARK: - Arguments

struct Options {
    var bundleID: String?
    /// Matched against the application's display name, for processes that
    /// have no bundle identifier — a bare binary has none.
    var appName: String?
    var list = false
    var windowTitle: String?
    /// x,y,w,h in window-relative points. Defaults to the whole window.
    var region: (x: Int, y: Int, w: Int, h: Int)?
    var action: Action = .none
    var runs = 5
    /// Moves the click down by this many points on each successive run.
    ///
    /// Clicking the same row twice measures nothing the second time: the row is
    /// already selected, so nothing repaints and the run burns its whole
    /// timeout. Measured on Apple Mail, run 1 came back at 110ms and run 2 at
    /// 9,027ms — and a median over those two is 4,568ms, a number that looks
    /// like a measurement and is not one. Stepping down the list gives every
    /// run an unselected row to land on.
    var clickStep = 0
    /// Alternates the click between its own row and the row this many points
    /// below it: run 1 on A, run 2 on B, run 3 on A again.
    ///
    /// `--click-step` walks off the bottom of the window after a couple of
    /// dozen runs; alternating never does, and every run still lands on a row
    /// that is not selected. Both rows are warm after the first pair, so this
    /// measures opening a message the client has seen before — the same for
    /// every client, and stated next to the result.
    var clickAlternate = 0
    /// Keys posted before every run, ahead of the wait for quiet.
    ///
    /// For actions that would otherwise accumulate: typing a search query
    /// twenty times into the same field searches for the query repeated twenty
    /// times. `--prepare cmd+a,backspace` empties the field, the list returns to
    /// its resting state, and only then is the baseline taken.
    var prepare: [Action] = []
    /// Save one frame of the window, with the region and click marked on it,
    /// and post nothing. For checking coordinates before trusting them.
    var snapshot: String?
    /// Report both permissions, asking for whichever is missing.
    var permissions = false
    /// How long to wait for the window to stop changing before each run.
    var quietMS = 700
    /// Consecutive identical frames that count as settled.
    var settleFrames = 6
    var timeoutMS = 15_000
    var fps = 120
    var label = "measurement"
    /// Launch this app bundle, time it to a window and to a still window, then
    /// quit it and time that. `--runs` cycles.
    var launch: String?
    /// Environment for the launched app, as K=V. A client that reads its
    /// profile from the environment (XDG variables, say) needs them passed
    /// through, and `open` would not.
    var env: [String: String] = [:]
    /// How long the window has to sit unchanged to count as ready after launch.
    var stillMS = 1500

    enum Action {
        case none
        /// A pause inside a `--prepare` sequence, for a client that animates
        /// between one step and the next.
        case wait(ms: Int)
        case click(x: Int, y: Int)
        case key(code: CGKeyCode, flags: CGEventFlags)
        case type(String)
        case scroll(dy: Int32, times: Int)
    }
}

func parseArgs() -> Options {
    var o = Options()
    var it = CommandLine.arguments.dropFirst().makeIterator()

    func next(_ flag: String) -> String {
        guard let v = it.next() else {
            FileHandle.standardError.write("\(flag) needs a value\n".data(using: .utf8)!)
            exit(2)
        }
        return v
    }

    while let arg = it.next() {
        switch arg {
        case "--app": o.bundleID = next(arg)
        case "--app-name": o.appName = next(arg)
        case "--list": o.list = true
        case "--window-title": o.windowTitle = next(arg)
        case "--label": o.label = next(arg)
        case "--runs": o.runs = Int(next(arg)) ?? 5
        case "--click-step": o.clickStep = Int(next(arg)) ?? 0
        case "--click-alternate": o.clickAlternate = Int(next(arg)) ?? 0
        case "--prepare":
            // Keys, or `click@x:y` to put focus somewhere first. Select-all
            // and delete is only safe where focus is known: in a message list
            // it deletes every message (that is how this option was learned).
            o.prepare = next(arg).split(separator: ",").map { token -> Options.Action in
                let t = String(token)
                if t.hasPrefix("wait@"), let ms = Int(t.dropFirst(5)) {
                    return .wait(ms: ms)
                }
                if t.hasPrefix("click@") {
                    let p = t.dropFirst(6).split(separator: ":").compactMap { Int($0) }
                    guard p.count == 2 else { fatalError("click@x:y") }
                    return .click(x: p[0], y: p[1])
                }
                return .key(code: keyCode(for: t), flags: keyFlags(for: t))
            }
        case "--snapshot": o.snapshot = next(arg)
        case "--launch": o.launch = next(arg)
        case "--env":
            let kv = next(arg)
            guard let eq = kv.firstIndex(of: "=") else { fatalError("--env wants K=V") }
            o.env[String(kv[..<eq])] = String(kv[kv.index(after: eq)...])
        case "--still-ms": o.stillMS = Int(next(arg)) ?? 1500
        case "--permissions": o.permissions = true
        case "--fps": o.fps = Int(next(arg)) ?? 120
        case "--quiet-ms": o.quietMS = Int(next(arg)) ?? 700
        case "--settle-frames": o.settleFrames = Int(next(arg)) ?? 6
        case "--timeout-ms": o.timeoutMS = Int(next(arg)) ?? 15_000
        case "--region":
            let p = next(arg).split(separator: ",").compactMap { Int($0) }
            guard p.count == 4 else { fatalError("--region wants x,y,w,h") }
            o.region = (p[0], p[1], p[2], p[3])
        case "--click":
            let p = next(arg).split(separator: ",").compactMap { Int($0) }
            guard p.count == 2 else { fatalError("--click wants x,y") }
            o.action = .click(x: p[0], y: p[1])
        case "--key":
            let spec = next(arg)
            o.action = .key(code: keyCode(for: spec), flags: keyFlags(for: spec))
        case "--type":
            o.action = .type(next(arg))
        case "--scroll":
            let p = next(arg).split(separator: ",").compactMap { Int($0) }
            o.action = .scroll(dy: Int32(p.first ?? -5), times: p.count > 1 ? p[1] : 20)
        case "--help", "-h":
            print(usage)
            exit(0)
        default:
            FileHandle.standardError.write("unknown argument \(arg)\n".data(using: .utf8)!)
            exit(2)
        }
    }
    return o
}

let usage = """
measure --list
measure (--app <bundle-id> | --app-name <name>) [--window-title <substring>]
        [--region x,y,w,h]
        (--click x,y | --key <spec> | --type <text> | --scroll dy,times)
        [--runs N] [--click-step DY | --click-alternate DY] [--prepare k1,k2]
        [--fps N] [--quiet-ms N] [--settle-frames N] [--timeout-ms N] [--label NAME]
measure (--app <bundle-id> | --app-name <name>) [--window-title <substring>]
        [--region x,y,w,h] [--click x,y] --snapshot out.png
measure --app <bundle-id> --launch /Applications/X.app [--env K=V]...
        [--window-title <substring>] [--region x,y,w,h] [--still-ms N] [--runs N]
        (the app must not be running; each run launches it and quits it)

Coordinates are window-relative points, origin top-left.
Key specs: "return", "escape", "j", "cmd+f", "shift+g", "backspace".
Prints one JSON object per run to stdout, and a summary object at the end.
"""

// MARK: - Keys

func keyFlags(for spec: String) -> CGEventFlags {
    var flags: CGEventFlags = []
    for part in spec.lowercased().split(separator: "+").dropLast() {
        switch part {
        case "cmd", "command": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt", "option": flags.insert(.maskAlternate)
        case "ctrl", "control": flags.insert(.maskControl)
        default: break
        }
    }
    return flags
}

func keyCode(for spec: String) -> CGKeyCode {
    let key = String(spec.lowercased().split(separator: "+").last ?? "")
    let map: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "o": 31, "u": 32,
        "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
        "return": 36, "tab": 48, "space": 49, "backspace": 51, "escape": 53, "delete": 51,
        "left": 123, "right": 124, "down": 125, "up": 126,
        "slash": 44, "comma": 43, "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
    ]
    guard let code = map[key] else {
        FileHandle.standardError.write("unknown key \(key)\n".data(using: .utf8)!)
        exit(2)
    }
    return code
}

// MARK: - Frame hashing
//
// FNV-1a over the watched region. Every byte, not a sample: a stride cheap
// enough to be worth having is also coarse enough to miss a one-line change,
// and the whole measurement is "did this region change".

@inline(__always)
func regionHash(_ buffer: CVPixelBuffer, region: (x: Int, y: Int, w: Int, h: Int)?) -> UInt64 {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)

    // The stream is configured in pixels; a region given in points is scaled
    // by the backing factor before it gets here.
    let x0 = max(0, region?.x ?? 0)
    let y0 = max(0, region?.y ?? 0)
    let x1 = min(width, region.map { $0.x + $0.w } ?? width)
    let y1 = min(height, region.map { $0.y + $0.h } ?? height)
    guard x1 > x0, y1 > y0 else { return 0 }

    var h: UInt64 = 0xcbf2_9ce4_8422_2325
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    for row in y0..<y1 {
        let start = row * stride + x0 * 4
        let end = row * stride + x1 * 4
        for i in start..<end {
            h = (h ^ UInt64(bytes[i])) &* 0x0000_0100_0000_01b3
        }
    }
    return h
}

// MARK: - Capture

final class Recorder: NSObject, SCStreamOutput, @unchecked Sendable {
    private let lock = NSLock()
    private var frames: [(t: Double, hash: UInt64)] = []
    private var region: (x: Int, y: Int, w: Int, h: Int)?

    init(region: (x: Int, y: Int, w: Int, h: Int)?) {
        self.region = region
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let pixels = CMSampleBufferGetImageBuffer(sb) else { return }

        // Frames whose status is not `.complete` are duplicates the compositor
        // emitted with no new content. Counting one as a change would report
        // a repaint that never happened.
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false)
            as? [[SCStreamFrameInfo: Any]],
           let raw = attachments.first?[.status] as? Int,
           let status = SCFrameStatus(rawValue: raw), status != .complete {
            return
        }

        let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
        let h = regionHash(pixels, region: region)
        lock.lock()
        frames.append((t, h))
        lock.unlock()
    }

    /// Frames captured since `since`, oldest first.
    func since(_ since: Double) -> [(t: Double, hash: UInt64)] {
        lock.lock()
        defer { lock.unlock() }
        return frames.filter { $0.t >= since }
    }

    func latest() -> (t: Double, hash: UInt64)? {
        lock.lock()
        defer { lock.unlock() }
        return frames.last
    }

    /// Drops everything but the newest frame.
    ///
    /// The newest is kept because ScreenCaptureKit delivers nothing while a
    /// window is still: after a full clear, a window that is not changing has
    /// no frames at all, and the next run has no baseline to compare against.
    func reset() {
        lock.lock()
        if let last = frames.last {
            frames.removeAll(keepingCapacity: true)
            frames.append(last)
        }
        lock.unlock()
    }
}

extension Options.Action {
    /// The same action, `dy` points further down the window.
    ///
    /// Only a click can be stepped. A keystroke goes wherever focus is and a
    /// scroll is relative already, so both are returned untouched rather than
    /// silently landing somewhere else.
    func stepped(by dy: Int) -> Options.Action {
        guard dy != 0, case let .click(x, y) = self else { return self }
        return .click(x: x, y: y + dy)
    }

    /// The point a click lands on, for marking it in a snapshot.
    var clickPoint: (x: Int, y: Int)? {
        if case let .click(x, y) = self { return (x, y) }
        return nil
    }
}

func case_click(_ a: Options.Action) -> Bool {
    if case .click = a { return true }
    return false
}

// MARK: - Snapshot

/// One frame of the window, with the watched region outlined in red and each
/// click point crossed in blue, written as a PNG.
///
/// Coordinates that are two rows off produce numbers rather than errors, and
/// the numbers look fine. Looking at the picture is the check.
func snapshot(_ window: SCWindow, region: (x: Int, y: Int, w: Int, h: Int)?,
              clicks: [(x: Int, y: Int)], to path: String) async throws {
    let config = SCStreamConfiguration()
    config.width = Int(window.frame.width)
    config.height = Int(window.frame.height)
    config.showsCursor = false
    let image = try await SCScreenshotManager.captureImage(
        contentFilter: SCContentFilter(desktopIndependentWindow: window), configuration: config)

    let w = image.width, h = image.height
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)
    else { throw NSError(domain: "measure", code: 1) }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

    // CoreGraphics is bottom-left; everything given to this tool is top-left.
    func flip(_ y: Int, _ height: Int = 0) -> CGFloat { CGFloat(h - y - height) }

    if let r = region {
        ctx.setStrokeColor(CGColor(red: 1, green: 0.1, blue: 0.1, alpha: 1))
        ctx.setLineWidth(3)
        ctx.stroke(CGRect(x: CGFloat(r.x), y: flip(r.y, r.h), width: CGFloat(r.w), height: CGFloat(r.h)))
    }
    ctx.setStrokeColor(CGColor(red: 0.1, green: 0.4, blue: 1, alpha: 1))
    ctx.setLineWidth(2)
    for c in clicks {
        let x = CGFloat(c.x), y = flip(c.y)
        ctx.strokeEllipse(in: CGRect(x: x - 9, y: y - 9, width: 18, height: 18))
        ctx.move(to: CGPoint(x: x - 16, y: y)); ctx.addLine(to: CGPoint(x: x + 16, y: y))
        ctx.move(to: CGPoint(x: x, y: y - 16)); ctx.addLine(to: CGPoint(x: x, y: y + 16))
        ctx.strokePath()
    }

    guard let out = ctx.makeImage(),
          let data = NSBitmapImageRep(cgImage: out).representation(using: .png, properties: [:])
    else { throw NSError(domain: "measure", code: 2) }
    try data.write(to: URL(fileURLWithPath: path))
}

// MARK: - Input

/// Puts the cursor somewhere without clicking. Done before the baseline is
/// taken, so a hover highlight it causes is part of the resting state rather
/// than the first "change" after the event.
func movePointer(to at: (x: Int, y: Int), windowOrigin: CGPoint) {
    let p = CGPoint(x: windowOrigin.x + CGFloat(at.x), y: windowOrigin.y + CGFloat(at.y))
    CGEvent(mouseEventSource: CGEventSource(stateID: .hidSystemState), mouseType: .mouseMoved,
            mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
}

func post(_ action: Options.Action, windowOrigin: CGPoint) {
    let source = CGEventSource(stateID: .hidSystemState)

    switch action {
    case .none, .wait:
        break

    case let .click(x, y):
        let p = CGPoint(x: windowOrigin.x + CGFloat(x), y: windowOrigin.y + CGFloat(y))
        CGEvent(mouseEventSource: source, mouseType: .mouseMoved,
                mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        CGEvent(mouseEventSource: source, mouseType: .leftMouseDown,
                mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        CGEvent(mouseEventSource: source, mouseType: .leftMouseUp,
                mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)

    case let .key(code, flags):
        let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)
        down?.flags = flags
        down?.post(tap: .cghidEventTap)
        let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
        up?.flags = flags
        up?.post(tap: .cghidEventTap)

    case let .type(text):
        // The character's own key where it has one, with the character
        // attached as well. Unicode alone, on key 0, works for AppKit apps but
        // not for Thunderbird, whose engine reads the key code and typed
        // nothing; a character with no key in the table still goes as Unicode.
        let table: [Character: CGKeyCode] = [
            "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
            "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
            "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28,
            "0": 29, "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40,
            "n": 45, "m": 46, " ": 49, ".": 47, ",": 43, "/": 44,
        ]
        for ch in text.utf16 {
            // A newline is the Return key, not a character: some clients only
            // search when it is pressed.
            if ch == 10 {
                post(.key(code: 36, flags: []), windowOrigin: windowOrigin)
                continue
            }
            var unit = ch
            let code = UnicodeScalar(ch).flatMap { table[Character($0)] } ?? 0
            let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)
            down?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unit)
            down?.post(tap: .cghidEventTap)
            let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
            up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unit)
            up?.post(tap: .cghidEventTap)
            usleep(8_000)
        }

    case let .scroll(dy, times):
        for _ in 0..<times {
            CGEvent(scrollWheelEvent2Source: source, units: .line,
                    wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
            usleep(8_000)
        }
    }
}

// MARK: - Run

@MainActor
func main() async throws {
    let o = parseArgs()

    if o.permissions {
        // Asking is what puts the app running this into the lists in System
        // Settings, so there is a switch there to turn on.
        let screen = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
        let prompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let input = AXIsProcessTrustedWithOptions([prompt: true] as CFDictionary)
        print(json(["event": "permissions", "screen_recording": screen, "accessibility": input]))
        exit(screen && input ? 0 : 1)
    }

    guard o.list || o.bundleID != nil || o.appName != nil else {
        print(usage)
        exit(2)
    }

    // A locked screen captures black, takes no input, and leaves every app
    // undrawn behind it. Every run would time out and look like a slow client.
    if let session = CGSessionCopyCurrentDictionary() as? [String: Any],
       (session["CGSSessionScreenIsLocked"] as? Bool) == true {
        FileHandle.standardError.write(
            "The screen is locked. Unlock this Mac (at its display or over Screen Sharing), then run again.\n"
                .data(using: .utf8)!)
        exit(3)
    }

    guard CGPreflightScreenCaptureAccess() else {
        FileHandle.standardError.write(
            "Screen Recording permission is not granted. Grant it in System Settings ▸ Privacy & Security ▸ Screen Recording, for whatever is running this, then run again.\n"
                .data(using: .utf8)!)
        CGRequestScreenCaptureAccess()
        exit(1)
    }

    if let path = o.launch {
        try await launchCycle(o, app: path)
        exit(0)
    }

    // Find the window.
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

    if o.list {
        for w in content.windows.sorted(by: { $0.frame.width * $0.frame.height > $1.frame.width * $1.frame.height })
        where w.frame.width > 200 && w.frame.height > 200 {
            print(json([
                "app": w.owningApplication?.applicationName ?? "",
                "bundle": w.owningApplication?.bundleIdentifier ?? "",
                "title": w.title ?? "",
                "w": w.frame.width, "h": w.frame.height,
                "x": w.frame.origin.x, "y": w.frame.origin.y,
            ]))
        }
        exit(0)
    }

    let candidates = content.windows.filter { window in
        guard let owner = window.owningApplication else { return false }
        if let id = o.bundleID, owner.bundleIdentifier != id { return false }
        if let name = o.appName,
           !owner.applicationName.localizedCaseInsensitiveContains(name) { return false }
        guard window.frame.width > 200, window.frame.height > 200 else { return false }
        if let title = o.windowTitle {
            return (window.title ?? "").localizedCaseInsensitiveContains(title)
        }
        return true
    }
    guard !candidates.isEmpty else {
        FileHandle.standardError.write("no window found for \(o.bundleID ?? o.appName ?? "?")\n".data(using: .utf8)!)
        exit(1)
    }
    // Refuse to guess. Picking the largest of several windows is how a run
    // ends up measuring a different window than the one under test, and it
    // fails as plausible numbers rather than as an error — which for an
    // instrument is worse than crashing.
    guard candidates.count == 1 else {
        let listed = candidates
            .map { "  \"\($0.title ?? "")\"  \(Int($0.frame.width))x\(Int($0.frame.height))" }
            .joined(separator: "\n")
        FileHandle.standardError.write(
            "\(candidates.count) windows match \(o.bundleID ?? o.appName ?? "?"). Narrow it with --window-title:\n\(listed)\n"
                .data(using: .utf8)!)
        exit(1)
    }
    let window = candidates[0]

    // Bring it forward: a background window is not the one a person is
    // clicking, and on macOS it may not even be composited at full rate.
    if let id = o.bundleID,
       let app = NSRunningApplication.runningApplications(withBundleIdentifier: id).first {
        app.activate(options: [.activateAllWindows])
        try await Task.sleep(nanoseconds: 400_000_000)
    } else if let pid = window.owningApplication?.processID,
              let app = NSRunningApplication(processIdentifier: pid) {
        app.activate(options: [.activateAllWindows])
        try await Task.sleep(nanoseconds: 400_000_000)
    }

    if let path = o.snapshot {
        var clicks: [(x: Int, y: Int)] = []
        if let p = o.action.clickPoint {
            clicks.append(p)
            if o.clickAlternate != 0 { clicks.append((p.x, p.y + o.clickAlternate)) }
        }
        try await snapshot(window, region: o.region, clicks: clicks, to: path)
        print(json(["event": "snapshot", "path": path, "title": window.title ?? "",
                    "w": window.frame.width, "h": window.frame.height]))
        exit(0)
    }

    // Captured at point resolution rather than backing resolution: the only
    // thing done with these pixels is comparing them to the previous frame,
    // and a 1:1 buffer means a `--region` in window points needs no scale
    // correction — which would otherwise be wrong the moment the window moved
    // to a display with a different backing factor.
    let scale = 1.0
    let config = SCStreamConfiguration()
    config.width = Int(window.frame.width)
    config.height = Int(window.frame.height)
    config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(o.fps))
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.showsCursor = false
    config.queueDepth = 8
    config.capturesAudio = false

    // The region arrives in window points and the buffer is in pixels.
    let region = o.region.map {
        (x: Int(Double($0.x) * scale), y: Int(Double($0.y) * scale),
         w: Int(Double($0.w) * scale), h: Int(Double($0.h) * scale))
    }

    let recorder = Recorder(region: region)
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let stream = SCStream(filter: filter, configuration: config, delegate: nil)
    try stream.addStreamOutput(recorder, type: .screen,
                               sampleHandlerQueue: DispatchQueue(label: "capture"))
    try await stream.startCapture()
    defer { Task { try? await stream.stopCapture() } }

    let origin = CGPoint(x: window.frame.origin.x, y: window.frame.origin.y)
    // Emitted so a run can be checked against where the window actually is;
    // a click posted into the wrong coordinate space produces plausible
    // nonsense rather than an error, which is the worst kind of bug for an
    // instrument to have.
    print(json(["event": "window", "title": window.title ?? "",
                "x": origin.x, "y": origin.y,
                "w": window.frame.width, "h": window.frame.height,
                "scale": scale,
                // The capture cannot see more often than the display refreshes:
                // at 60Hz every number below is quantised to ~16.7ms whatever
                // --fps says.
                "display_hz": NSScreen.main?.maximumFramesPerSecond ?? 0]))
    fflush(stdout)
    // The window of stillness that counts as settled, and as quiet before a run.
    let refresh = Double(min(o.fps, max(NSScreen.main?.maximumFramesPerSecond ?? 60, 1)))
    let settleWindow = Double(o.settleFrames) / refresh
    var firsts: [Double] = []
    var settles: [Double] = []

    for run in 1...o.runs {
        if !o.prepare.isEmpty {
            for step in o.prepare {
                if case let .wait(ms) = step {
                    usleep(useconds_t(ms) * 1000)
                    continue
                }
                post(step, windowOrigin: origin)
                usleep(case_click(step) ? 150_000 : 30_000)
            }
        }
        // A scroll goes to whatever is under the cursor, and after a click on
        // a search field that is the search field — scrolling it measures
        // nothing. Put the cursor in the middle of the watched region first.
        if case .scroll = o.action, let r = o.region {
            movePointer(to: (r.x + r.w / 2, r.y + r.h / 2), windowOrigin: origin)
        }

        // Wait for the window to go quiet, so the baseline is a real resting
        // state rather than the tail of the previous run.
        try await waitQuiet(recorder, still: settleWindow, timeoutMS: o.quietMS * 4)
        try await Task.sleep(nanoseconds: UInt64(o.quietMS) * 1_000_000)

        guard let baseline = recorder.latest() else {
            FileHandle.standardError.write("no frames captured; is the window visible?\n".data(using: .utf8)!)
            exit(1)
        }
        recorder.reset()

        // The event's timestamp is taken on the same clock the capture
        // presentation timestamps use, so the two are directly comparable and
        // nothing has to be corrected for afterwards.
        let sentAt = CMClockGetTime(CMClockGetHostTimeClock()).seconds
        let offset = o.clickAlternate != 0
            ? (run % 2 == 0 ? o.clickAlternate : 0)
            : o.clickStep * (run - 1)
        post(o.action.stepped(by: offset), windowOrigin: origin)

        var first: Double?
        var settle: Double?
        let deadline = Date().addingTimeInterval(Double(o.timeoutMS) / 1000)

        while Date() < deadline {
            // Walk the frames since the event, noting the first that differs
            // from the baseline and the last that differs from its predecessor.
            var previous = baseline.hash
            var lastChange: Double?
            for frame in recorder.since(sentAt) where frame.hash != previous {
                if first == nil { first = (frame.t - sentAt) * 1000 }
                lastChange = frame.t
                previous = frame.hash
            }
            // Settled: nothing has changed for `settleFrames` display
            // refreshes. Judged by the clock rather than by counting identical
            // frames, because a still window produces no frames to count.
            if let changed = lastChange, hostNow() - changed >= settleWindow {
                settle = (changed - sentAt) * 1000
                break
            }
            try await Task.sleep(nanoseconds: 4_000_000)
        }

        let f = first ?? Double.nan
        let s = settle ?? Double.nan
        firsts.append(f)
        settles.append(s)
        print(json(["event": "run", "label": o.label, "run": run,
                    "first_ms": round(f * 100) / 100, "settle_ms": round(s * 100) / 100]))
        fflush(stdout)
    }

    let goodFirst = firsts.filter { $0.isFinite }.sorted()
    let goodSettle = settles.filter { $0.isFinite }.sorted()
    print(json([
        "event": "summary",
        "label": o.label,
        "app": o.bundleID ?? o.appName ?? "",
        "runs": o.runs,
        "captured": goodFirst.count,
        "fps": o.fps,
        // The median rather than the mean: one run in ten catches a background
        // sync or a Spotlight wake-up, and a mean lets that one run set the
        // number for the other nine.
        "first_ms_median": goodFirst.isEmpty ? Double.nan : median(goodFirst),
        "first_ms_min": goodFirst.first ?? Double.nan,
        "settle_ms_median": goodSettle.isEmpty ? Double.nan : median(goodSettle),
        "settle_ms_max": goodSettle.last ?? Double.nan,
    ]))
}

// MARK: - Launch and quit

/// The windows of `o`'s app that a measurement could mean, by the same rules
/// as an ordinary run.
func matchingWindows(_ o: Options) async throws -> [SCWindow] {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    return content.windows.filter { window in
        guard let owner = window.owningApplication else { return false }
        if let id = o.bundleID, owner.bundleIdentifier != id { return false }
        if let name = o.appName,
           !owner.applicationName.localizedCaseInsensitiveContains(name) { return false }
        guard window.frame.width > 200, window.frame.height > 200 else { return false }
        if let title = o.windowTitle {
            return (window.title ?? "").localizedCaseInsensitiveContains(title)
        }
        return true
    }
}

/// Launch to ready, then quit to gone, `--runs` times.
///
/// Launched through Launch Services, the way a click in the Dock launches it,
/// so every client pays the same system overhead. Three numbers per run:
///
///   window  the app's main window is on screen. Polled, so up to one
///           poll (~10-20ms) late.
///   ready   the watched region (the list, normally) last changed before
///           sitting still for `--still-ms`. A list that fills in after the
///           window appears is not ready when the window is.
///   quit    from asking the app to quit, as the Quit menu item does, to the
///           process having exited.
///
/// Warm, not cold: the first run reads the app and its store from disk and
/// later ones from the page cache. Run 1 is reported apart for that reason.
@MainActor
func launchCycle(_ o: Options, app path: String) async throws {
    guard let id = o.bundleID else { fatalError("--launch needs --app <bundle-id>") }
    // Launch Services asserts on a process with no connection to the window
    // server, and a command-line tool has none until AppKit is touched.
    _ = NSApplication.shared
    guard NSRunningApplication.runningApplications(withBundleIdentifier: id).isEmpty else {
        FileHandle.standardError.write("\(id) is already running; quit it first\n".data(using: .utf8)!)
        exit(1)
    }
    let url = URL(fileURLWithPath: path)
    let still = Double(o.stillMS) / 1000
    var windows: [Double] = [], readies: [Double] = [], quits: [Double] = []

    for run in 1...o.runs {
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        config.addsToRecentItems = false
        if !o.env.isEmpty { config.environment = o.env }

        let t0 = hostNow()
        let running = try await NSWorkspace.shared.openApplication(at: url, configuration: config)

        // Window: poll until it is on screen.
        var window: SCWindow?
        let deadline = Date().addingTimeInterval(Double(o.timeoutMS) / 1000)
        while window == nil && Date() < deadline {
            window = try await matchingWindows(o).first
            if window == nil { try await Task.sleep(nanoseconds: 5_000_000) }
        }
        guard let window else {
            FileHandle.standardError.write("run \(run): no window within \(o.timeoutMS)ms\n".data(using: .utf8)!)
            running.forceTerminate()
            exit(1)
        }
        let windowAt = hostNow()

        // Ready: watch the region until it has been still long enough.
        let cfg = SCStreamConfiguration()
        cfg.width = Int(window.frame.width)
        cfg.height = Int(window.frame.height)
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(o.fps))
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.showsCursor = false
        cfg.queueDepth = 8
        let recorder = Recorder(region: o.region)
        let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window),
                              configuration: cfg, delegate: nil)
        try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture"))
        try await stream.startCapture()
        var lastChange = windowAt
        while Date() < deadline {
            var previous: UInt64?
            for frame in recorder.since(0) {
                if let p = previous, p != frame.hash { lastChange = max(lastChange, frame.t) }
                previous = frame.hash
            }
            if hostNow() - lastChange >= still { break }
            try await Task.sleep(nanoseconds: 8_000_000)
        }
        try? await stream.stopCapture()

        // Quit, as the menu item does, and wait for the process to be gone.
        let pid = running.processIdentifier
        let q0 = hostNow()
        running.terminate()
        var quitAt: Double?
        while Date() < deadline.addingTimeInterval(30) {
            if kill(pid, 0) != 0 { quitAt = hostNow(); break }
            try await Task.sleep(nanoseconds: 2_000_000)
        }
        if quitAt == nil { running.forceTerminate() }

        let w = (windowAt - t0) * 1000, r = (lastChange - t0) * 1000
        let q = quitAt.map { ($0 - q0) * 1000 } ?? Double.nan
        print(json(["event": "launch", "label": o.label, "run": run,
                    "window_ms": round(w * 100) / 100, "ready_ms": round(r * 100) / 100,
                    "quit_ms": round(q * 100) / 100]))
        fflush(stdout)
        if run > 1 { windows.append(w); readies.append(r); if q.isFinite { quits.append(q) } }
        // Let whatever the app does on its way out finish before the next launch.
        try await Task.sleep(nanoseconds: 2_000_000_000)
    }

    // Warm runs only, in the shape the report reads: `first` is the window,
    // `settle` is ready. Quit has one number, so it fills both.
    let n = max(o.runs - 1, 0)
    print(json(["event": "summary", "label": "\(o.label)/launch", "app": id, "runs": n,
                "captured": readies.count, "fps": o.fps,
                "first_ms_median": median(windows.sorted()), "first_ms_min": windows.min() ?? Double.nan,
                "settle_ms_median": median(readies.sorted()), "settle_ms_max": readies.max() ?? Double.nan]))
    print(json(["event": "summary", "label": "\(o.label)/quit", "app": id, "runs": n,
                "captured": quits.count, "fps": o.fps,
                "first_ms_median": median(quits.sorted()), "first_ms_min": quits.min() ?? Double.nan,
                "settle_ms_median": median(quits.sorted()), "settle_ms_max": quits.max() ?? Double.nan]))
}

func median(_ sorted: [Double]) -> Double {
    guard !sorted.isEmpty else { return .nan }
    let mid = sorted.count / 2
    let m = sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    return round(m * 100) / 100
}

func hostNow() -> Double { CMClockGetTime(CMClockGetHostTimeClock()).seconds }

/// Waits until nothing in the region has changed for `still` seconds.
func waitQuiet(_ recorder: Recorder, still: Double, timeoutMS: Int) async throws {
    let deadline = Date().addingTimeInterval(Double(timeoutMS) / 1000)
    while Date() < deadline {
        // Frames also arrive for changes outside the region, so the last
        // frame is not necessarily the last change *in* it.
        var lastChange = 0.0
        var previous: UInt64?
        for frame in recorder.since(0) {
            if let p = previous, p != frame.hash { lastChange = frame.t }
            previous = frame.hash
        }
        if hostNow() - lastChange >= still { return }
        try await Task.sleep(nanoseconds: 8_000_000)
    }
}

func json(_ dict: [String: Any]) -> String {
    let cleaned = dict.mapValues { value -> Any in
        if let d = value as? Double, !d.isFinite { return NSNull() }
        return value
    }
    guard let data = try? JSONSerialization.data(withJSONObject: cleaned, options: [.sortedKeys]),
          let s = String(data: data, encoding: .utf8) else { return "{}" }
    return s
}

try await main()
