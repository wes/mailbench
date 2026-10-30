// The instrument's calibration target.
//
// A window that changes colour a known number of milliseconds after it is
// clicked. Point `measure` at it, and the difference between what it reports
// and the delay asked for here is the instrument's own overhead — capture
// latency, compositor latency, and the quantisation of a frame.
//
// A benchmark whose instrument has never been checked against a known interval
// is a benchmark reporting whatever its bugs happen to produce. This is the
// check, and it ships with the tool so anyone reading the results can repeat
// it.
//
//   swiftc -O harness/calibrate.swift -o harness/bin/calibrate
//   harness/bin/calibrate --delay 200 &
//   harness/bin/measure --app-name calibrate --window-title Calibrate \
//                       --click 450,350 --runs 20 --label calibrate/200
//
// Expected: `first_ms` a little above 200, by one frame plus a millisecond or
// two. Anything else means the instrument is wrong, not the target.

import AppKit

final class Flipper: NSView {
    var delayMS: Double = 200
    private var on = false

    override var isFlipped: Bool { true }

    override func mouseDown(with event: NSEvent) {
        let clicked = CFAbsoluteTimeGetCurrent()

        // Scheduled off the click rather than animated: the point is a step
        // change at a known time, not a transition whose midpoint is a matter
        // of opinion.
        //
        // The deadline is set slightly short and the last stretch is spun,
        // because `asyncAfter` alone drifts tens of milliseconds at longer
        // delays — macOS coalesces timers, and a calibration target that fires
        // late reports the instrument as slow when it is the target that was.
        let deadline = clicked + delayMS / 1000
        let wake = max(0, delayMS / 1000 - 0.010)

        DispatchQueue.main.asyncAfter(deadline: .now() + wake) { [weak self] in
            guard let self else { return }
            while CFAbsoluteTimeGetCurrent() < deadline { /* spin the last 10ms */ }

            self.on.toggle()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            self.layer?.backgroundColor = self.on
                ? NSColor.white.cgColor
                : NSColor(calibratedWhite: 0.07, alpha: 1).cgColor
            CATransaction.commit()
            CATransaction.flush()

            // What the target actually did, as opposed to what it was asked to
            // do. The instrument's overhead is its own number minus this one,
            // and without this line the two are not separable.
            let fired = (CFAbsoluteTimeGetCurrent() - clicked) * 1000
            FileHandle.standardError.write(
                String(format: "{\"event\":\"fired\",\"asked_ms\":%.1f,\"actual_ms\":%.2f}\n",
                       self.delayMS, fired).data(using: .utf8)!)
        }
    }
}

final class Delegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var activity: NSObjectProtocol?
    let delayMS: Double

    init(delayMS: Double) {
        self.delayMS = delayMS
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        let view = Flipper(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.delayMS = delayMS
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor(calibratedWhite: 0.07, alpha: 1).cgColor

        window = NSWindow(
            contentRect: view.frame,
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false)
        window.title = "Calibrate"
        window.contentView = view
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        activity = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiated, .latencyCritical],
            reason: "calibration target must not be coalesced")

        FileHandle.standardError.write(
            "calibrate: window up, flipping \(Int(delayMS))ms after each click\n"
                .data(using: .utf8)!)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

var delay = 200.0
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
    if a == "--delay", let v = args.next(), let d = Double(v) { delay = d }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = Delegate(delayMS: delay)
app.delegate = delegate
app.run()
