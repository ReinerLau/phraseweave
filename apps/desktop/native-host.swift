import Foundation

// Chrome native messaging uses a little-endian 32-bit length before each JSON message.
func readBytes(_ count: Int) throws -> Data {
    var data = Data()
    while data.count < count {
        guard let chunk = try FileHandle.standardInput.read(upToCount: count - data.count),
              !chunk.isEmpty else {
            throw NSError(domain: "PhraseWeaveNativeHost", code: 1)
        }
        data.append(chunk)
    }
    return data
}

func reply(_ result: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: result) else { return }
    var length = UInt32(data.count).littleEndian
    let header = withUnsafeBytes(of: &length) { Data($0) }
    FileHandle.standardOutput.write(header)
    FileHandle.standardOutput.write(data)
}

do {
    let header = try readBytes(4)
    let size = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }.littleEndian
    guard size > 0, size <= 300_000 else {
        throw NSError(domain: "PhraseWeaveNativeHost", code: 2)
    }
    let input = try JSONSerialization.jsonObject(with: readBytes(Int(size)))
    guard let message = input as? [String: Any],
          message["type"] as? String == "capture",
          let text = message["text"] as? String,
          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          text.utf16.count <= 30_000 else {
        throw NSError(domain: "PhraseWeaveNativeHost", code: 3)
    }

    let captures = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/PhraseWeave/captures", isDirectory: true)
    try FileManager.default.createDirectory(
        at: captures,
        withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700]
    )
    let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    let file = captures.appendingPathComponent("\(id).json")
    let payload = try JSONSerialization.data(withJSONObject: ["text": text])
    try payload.write(to: file, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)

    let host = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    let app = host.deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
    let opener = Process()
    opener.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    opener.arguments = ["-a", app.path, "phraseweave://capture/\(id)"]
    try opener.run()
    opener.waitUntilExit()
    guard opener.terminationStatus == 0 else {
        try? FileManager.default.removeItem(at: file)
        throw NSError(domain: "PhraseWeaveNativeHost", code: 4)
    }
    reply(["ok": true])
} catch {
    reply(["ok": false, "error": "无法将选中文本交给桌面应用，请确认应用已安装。"])
}
