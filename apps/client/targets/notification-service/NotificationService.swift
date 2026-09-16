import Intents
import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var downloadTask: URLSessionDataTask?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard
            let content = bestAttemptContent,
            let avatar = content.userInfo["avatarUrl"] as? String,
            let avatarURL = URL(string: avatar),
            avatarURL.scheme == "https"
        else {
            finish()
            return
        }

        downloadTask = URLSession.shared.dataTask(with: avatarURL) { [weak self] data, _, _ in
            guard let self else { return }
            guard let data, !data.isEmpty, data.count <= 10 * 1_024 * 1_024 else {
                self.finish()
                return
            }
            self.applyCommunicationAvatar(data: data)
        }
        downloadTask?.resume()
    }

    private func applyCommunicationAvatar(data: Data) {
        guard let content = bestAttemptContent else {
            finish()
            return
        }

        let senderName = (content.userInfo["contactName"] as? String)
            ?? (content.userInfo["chatName"] as? String)
            ?? content.title
        let chatID = (content.userInfo["chatId"] as? String) ?? UUID().uuidString
        let senderID = (content.userInfo["senderId"] as? String) ?? senderName
        let handle = INPersonHandle(value: senderID, type: .unknown)
        let sender = INPerson(
            personHandle: handle,
            nameComponents: nil,
            displayName: senderName,
            image: INImage(imageData: data),
            contactIdentifier: nil,
            customIdentifier: senderID
        )
        let groupName: INSpeakableString? = (content.userInfo["isGroup"] as? Bool) == true
            ? INSpeakableString(spokenPhrase: (content.userInfo["chatName"] as? String) ?? senderName)
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

        if groupName != nil {
            intent.setImage(INImage(imageData: data), forParameterNamed: \INSendMessageIntent.speakableGroupName)
        }

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)

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
        guard let handler = contentHandler else { return }
        contentHandler = nil
        handler(content ?? bestAttemptContent ?? UNNotificationContent())
    }

    override func serviceExtensionTimeWillExpire() {
        downloadTask?.cancel()
        finish()
    }
}
