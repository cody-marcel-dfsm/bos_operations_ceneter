#!/usr/bin/env swift

import AppKit
import Foundation

struct LaunchError: Error, CustomStringConvertible {
    let description: String
}

func argument(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name),
          CommandLine.arguments.indices.contains(index + 1) else {
        return nil
    }
    return CommandLine.arguments[index + 1]
}

func executable(_ candidates: [String]) -> URL? {
    candidates
        .map { URL(fileURLWithPath: $0) }
        .first { FileManager.default.isExecutableFile(atPath: $0.path) }
}

func resolveGcloud() throws -> URL {
    if let configured = argument("--gcloud") {
        guard let resolved = executable([configured]) else {
            throw LaunchError(description: "Configured gcloud executable is unavailable: \(configured)")
        }
        return resolved
    }
    let which = Process()
    let output = Pipe()
    which.executableURL = URL(fileURLWithPath: "/usr/bin/which")
    which.arguments = ["gcloud"]
    which.standardOutput = output
    which.standardError = FileHandle.nullDevice
    try which.run()
    which.waitUntilExit()
    if which.terminationStatus == 0 {
        let path = String(
            data: output.fileHandleForReading.readDataToEndOfFile(),
            encoding: .utf8
        )?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let resolved = executable([path]) { return resolved }
    }
    if let resolved = executable([
        "/opt/homebrew/bin/gcloud",
        "/usr/local/bin/gcloud"
    ]) {
        return resolved
    }
    throw LaunchError(description: "gcloud executable not found; add it to PATH or pass --gcloud <path>")
}

func readSecret(named secretName: String, gcloud: URL) throws -> String {
    let process = Process()
    let output = Pipe()
    let errors = Pipe()
    process.executableURL = gcloud
    process.arguments = [
        "secrets", "versions", "access", "latest",
        "--secret", secretName
    ]
    process.standardOutput = output
    process.standardError = errors
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
        let message = String(
            data: errors.fileHandleForReading.readDataToEndOfFile(),
            encoding: .utf8
        )?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "unknown gcloud error"
        throw LaunchError(description: "Unable to read the managed BOS credential: \(message)")
    }
    let secret = String(
        data: output.fileHandleForReading.readDataToEndOfFile(),
        encoding: .utf8
    )?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !secret.isEmpty else {
        throw LaunchError(description: "The managed BOS credential is empty")
    }
    return secret
}

func stopRunningChatGPT(app: URL) throws {
    guard let bundleIdentifier = Bundle(url: app)?.bundleIdentifier else {
        throw LaunchError(description: "Unable to resolve the ChatGPT bundle identifier")
    }
    let running = NSRunningApplication.runningApplications(
        withBundleIdentifier: bundleIdentifier
    )
    guard !running.isEmpty else { return }
    guard CommandLine.arguments.contains("--replace") ||
          CommandLine.arguments.contains("--force-replace") else {
        throw LaunchError(
            description: "ChatGPT is already running. Re-run with --replace to close it and start the credential-scoped instance."
        )
    }
    for application in running { application.terminate() }
    let deadline = Date(timeIntervalSinceNow: 15)
    while running.contains(where: { !$0.isTerminated }) && Date() < deadline {
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
    }
    if running.contains(where: { !$0.isTerminated }) &&
       CommandLine.arguments.contains("--force-replace") {
        for application in running where !application.isTerminated {
            application.forceTerminate()
        }
        let forceDeadline = Date(timeIntervalSinceNow: 5)
        while running.contains(where: { !$0.isTerminated }) && Date() < forceDeadline {
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
        }
    }
    guard running.allSatisfy(\.isTerminated) else {
        throw LaunchError(description: "ChatGPT did not close within 15 seconds; re-run with --force-replace after saving active work")
    }
}

func launchChatGPT(secret: String, app: URL) throws {
    try stopRunningChatGPT(app: app)
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    configuration.environment = ProcessInfo.processInfo.environment.merging(
        ["BOS_API_KEY": secret],
        uniquingKeysWith: { _, scoped in scoped }
    )
    let semaphore = DispatchSemaphore(value: 0)
    var launchError: Error?
    NSWorkspace.shared.openApplication(
        at: app,
        configuration: configuration
    ) { application, error in
        launchError = error
        if let application {
            print("Started ChatGPT/Codex with the process-scoped BOS credential (pid \(application.processIdentifier)).")
        }
        semaphore.signal()
    }
    while semaphore.wait(timeout: .now() + 0.1) == .timedOut {
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
    }
    if let launchError { throw launchError }
}

do {
    guard let secretName = argument("--gcp-secret"), !secretName.isEmpty else {
        throw LaunchError(description: "Usage: launch-codex-with-bos.swift --gcp-secret <secret-name> [--gcloud <path>] [--replace] [--force-replace]")
    }
    let app = URL(fileURLWithPath: argument("--app") ?? "/Applications/ChatGPT.app")
    guard FileManager.default.fileExists(atPath: app.path) else {
        throw LaunchError(description: "ChatGPT application not found at \(app.path)")
    }
    let gcloud = try resolveGcloud()
    if CommandLine.arguments.contains("--check") {
        print("ChatGPT and gcloud launch dependencies are available.")
        exit(0)
    }
    let secret = try readSecret(named: secretName, gcloud: gcloud)
    try launchChatGPT(secret: secret, app: app)
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
