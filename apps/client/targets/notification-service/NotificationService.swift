import Intents
import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var downloadTask: URLSessionDataTask?
    private let finishLock = NSLock()

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let content = bestAttemptContent else {
            finish()
            return
        }

        guard
            let avatar = stringValue("avatarUrl", in: content),
            let avatarURL = URL(string: avatar),
            avatarURL.scheme?.lowercased() == "https"
        else {
            applyCommunicationContent(avatarData: nil)
            return
        }

        downloadTask = URLSession.shared.dataTask(with: avatarURL) { [weak self] data, response, _ in
            guard let self else { return }
            let httpResponse = response as? HTTPURLResponse
            let isSuccessful = httpResponse.map { (200..<300).contains($0.statusCode) } ?? false
            let isImage = httpResponse?.mimeType?.lowercased().hasPrefix("image/") == true
            let validData = data.flatMap {
                isSuccessful && isImage && !$0.isEmpty && $0.count <= 5 * 1_024 * 1_024
                    ? $0
                    : nil
            }
            self.applyCommunicationContent(avatarData: validData)
        }
        downloadTask?.resume()
    }

    private func stringValue(_ key: String, in content: UNNotificationContent) -> String? {
        guard let value = content.userInfo[key] as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func boolValue(_ key: String, in content: UNNotificationContent) -> Bool {
        if let value = content.userInfo[key] as? Bool { return value }
        if let value = content.userInfo[key] as? NSNumber { return value.boolValue }
        if let value = content.userInfo[key] as? String {
            return ["true", "1", "yes"].contains(value.lowercased())
        }
        return false
    }

    private func applyCommunicationContent(avatarData: Data?, donate: Bool = true) {
        guard let content = bestAttemptContent else {
            finish()
            return
        }

        let senderName = stringValue("senderName", in: content)
            ?? (!content.title.isEmpty ? content.title : nil)
            ?? stringValue("contactName", in: content)
            ?? stringValue("chatName", in: content)
            ?? "New message"
        let chatID = stringValue("chatId", in: content) ?? UUID().uuidString
        let senderID = stringValue("senderId", in: content) ?? senderName
        let isGroup = boolValue("isGroup", in: content)
        let avatarType = stringValue("avatarType", in: content)
        let avatarImage = avatarData.map(INImage.init(imageData:))
        let handle = INPersonHandle(value: senderID, type: .unknown)
        let sender = INPerson(
            personHandle: handle,
            nameComponents: nil,
            displayName: senderName,
            image: !isGroup || avatarType == "sender" ? avatarImage : nil,
            contactIdentifier: nil,
            customIdentifier: senderID
        )
        let groupName: INSpeakableString? = isGroup
            ? INSpeakableString(spokenPhrase: stringValue("chatName", in: content) ?? "Group chat")
            : nil
        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: groupName,
            conversationIdentifier: chatID,
            serviceName: "Claire",
            sender: sender,
            attachments: nil
        )

        if isGroup, avatarType == "group", let avatarImage {
            intent.setImage(avatarImage, forParameterNamed: \INSendMessageIntent.speakableGroupName)
        }

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        if donate {
            interaction.donate { [weak self] _ in
                self?.finishUpdatedContent(using: intent)
            }
        } else {
            finishUpdatedContent(using: intent)
        }
    }

    private func finishUpdatedContent(using intent: INSendMessageIntent) {
        guard let content = bestAttemptContent else {
            finish()
            return
        }
        do {
            let updated = try content.updating(from: intent)
            finish(with: updated)
        } catch {
            // If the OS cannot promote this to a communication notification,
            // keep the normal Claire title/body rather than dropping the push.
            finish()
        }
    }

    private func finish(with content: UNNotificationContent? = nil) {
        finishLock.lock()
        guard let handler = contentHandler else {
            finishLock.unlock()
            return
        }
        contentHandler = nil
        finishLock.unlock()
        handler(content ?? bestAttemptContent ?? UNNotificationContent())
    }

    override func serviceExtensionTimeWillExpire() {
        downloadTask?.cancel()
        applyCommunicationContent(avatarData: nil, donate: false)
    }
}
