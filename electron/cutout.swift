// Person segmentation mask for every frame of a video, with Apple Vision (macOS 12+).
// Usage: cutout <video> <width> <height>
// Writes one 8-bit grey mask per frame (width*height bytes, displayed orientation) to stdout,
// and "progress <0..1>" lines to stderr.
import AVFoundation
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 4, let outW = Int(args[2]), let outH = Int(args[3]) else {
    FileHandle.standardError.write("usage: cutout <video> <width> <height>\n".data(using: .utf8)!)
    exit(2)
}

let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let track = asset.tracks(withMediaType: .video).first, let reader = try? AVAssetReader(asset: asset) else {
    FileHandle.standardError.write("cannot read video\n".data(using: .utf8)!)
    exit(1)
}
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
output.alwaysCopiesSampleData = false
reader.add(output)
reader.startReading()

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .balanced
request.outputPixelFormat = kCVPixelFormatType_OneComponent8

let ctx = CIContext(options: [.workingColorSpace: NSNull()])
let transform = track.preferredTransform
let total = max(1.0, CMTimeGetSeconds(asset.duration))
var buffer = [UInt8](repeating: 0, count: outW * outH)
let stdout = FileHandle.standardOutput
var lastReport = -1.0

while let sample = output.copyNextSampleBuffer() {
    guard let frame = CMSampleBufferGetImageBuffer(sample) else { continue }
    let handler = VNImageRequestHandler(cvPixelBuffer: frame, options: [:])
    try? handler.perform([request])
    if let mask = request.results?.first?.pixelBuffer {
        // Mask -> displayed orientation -> output size.
        var img = CIImage(cvPixelBuffer: mask)
        let sx = CGFloat(CVPixelBufferGetWidth(frame)) / img.extent.width
        let sy = CGFloat(CVPixelBufferGetHeight(frame)) / img.extent.height
        img = img.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
        // Core Image's origin is bottom-left: flip to top-left, apply the track rotation, flip back.
        let h = img.extent.height
        img = img.transformed(by: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: h))
        img = img.transformed(by: transform)
        img = img.transformed(by: CGAffineTransform(translationX: -img.extent.minX, y: -img.extent.minY))
        let h2 = img.extent.height
        img = img.transformed(by: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: h2))
        img = img.transformed(by: CGAffineTransform(scaleX: CGFloat(outW) / img.extent.width, y: CGFloat(outH) / img.extent.height))
        buffer.withUnsafeMutableBytes { ptr in
            ctx.render(img, toBitmap: ptr.baseAddress!, rowBytes: outW, bounds: CGRect(x: 0, y: 0, width: outW, height: outH), format: .L8, colorSpace: nil)
        }
    } else {
        for i in 0..<buffer.count { buffer[i] = 255 }
    }
    stdout.write(Data(buffer))
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) / total
    if t - lastReport > 0.02 {
        lastReport = t
        FileHandle.standardError.write("progress \(t)\n".data(using: .utf8)!)
    }
}
