import Foundation

struct Conversation: Codable, Equatable {
    var likes: [String: Bool] = [:]
    var comments: [Comment] = []
    enum CodingKeys: String, CodingKey { case likes, comments }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        likes = try c.decodeIfPresent([String: Bool].self, forKey: .likes) ?? [:]
        comments = try c.decodeIfPresent([Comment].self, forKey: .comments) ?? []
    }
}
struct Comment: Codable, Identifiable, Equatable {
    var id: String
    var author: String
    var text: String
    var createdAt: String
}
struct Post: Codable, Identifiable, Equatable {
    var id: String
    var editKey: String?
    var editVersion: String?
    var date: String = ""
    var text: String?
    var caption: String?
    var note: String?
    var src: String?
    var author: String?
    var createdAt: String?
    var revision: String?
    var contentHash: String?
    var social: Conversation?
    var pending: Bool?
    var isPhoto: Bool { src != nil }
    var kind: String { isPhoto ? "photo" : "quote" }
    var key: String { "\(kind):\(id)" }
    var name: String { Self.name(author ?? "us") }
    static func name(_ actor: String) -> String { actor == "asnat" ? "Asnat" : actor == "youssef" ? "Youssef" : "Our little us" }
    var content: String { isPhoto ? caption ?? "" : text ?? "" }
    var imageURL: String {
        guard let src else { return "" }
        if src.hasPrefix("assets/photos/") {
            return "/api/together-photo?kind=memory&id=\(id)&v=\(revision ?? contentHash ?? id)"
        }
        return src
    }
    enum CodingKeys: String, CodingKey {
        case id, editKey, editVersion, date, text, caption, note, src, author, createdAt, revision, contentHash, social, pending
    }
    init(id: String, date: String = "", text: String? = nil, src: String? = nil) {
        self.id=id; self.date=date; self.text=text; self.src=src
    }
    init(from decoder: Decoder) throws {
        if let string = try? decoder.singleValueContainer().decode(String.self) {
            self.init(id: UUID().uuidString.lowercased(), text: string); return
        }
        let c=try decoder.container(keyedBy: CodingKeys.self)
        id=try c.decodeIfPresent(String.self,forKey:.id) ?? c.decodeIfPresent(String.self,forKey:.editKey) ?? UUID().uuidString.lowercased()
        editKey=try c.decodeIfPresent(String.self,forKey:.editKey); editVersion=try c.decodeIfPresent(String.self,forKey:.editVersion)
        date=try c.decodeIfPresent(String.self,forKey:.date) ?? ""
        text=try c.decodeIfPresent(String.self,forKey:.text); caption=try c.decodeIfPresent(String.self,forKey:.caption)
        note=try c.decodeIfPresent(String.self,forKey:.note); src=try c.decodeIfPresent(String.self,forKey:.src)
        author=try c.decodeIfPresent(String.self,forKey:.author); createdAt=try c.decodeIfPresent(String.self,forKey:.createdAt)
        revision=try c.decodeIfPresent(String.self,forKey:.revision); contentHash=try c.decodeIfPresent(String.self,forKey:.contentHash)
        social=try c.decodeIfPresent(Conversation.self,forKey:.social); pending=try c.decodeIfPresent(Bool.self,forKey:.pending)
    }
}
struct Memories: Codable {
    var version: Int = 1
    var quotes: [Post] = []
    var photos: [Post] = []
    var writable: Bool?
    var posts: [Post] {
        (quotes+photos).sorted { a,b in
            a.date == b.date ? (a.createdAt ?? "") > (b.createdAt ?? "") : a.date > b.date
        }
    }
}
struct PendingChange: Codable, Identifiable {
    var id: String
    var path: String
    var body: Data
    var createdAt: String
    var error: String?
}
enum Projection {
    static func apply(_ pending: PendingChange, to memories: inout Memories) {
        guard pending.path == "/api/memories", let body=(try? JSONSerialization.jsonObject(with: pending.body)) as? [String:Any],
              let action=body["action"] as? String, let operation=body["operationId"] as? String else { return }
        let isPhoto=(body["kind"] as? String)=="photo" || action.hasSuffix("Photo")
        var values=isPhoto ? memories.photos : memories.quotes
        let id=body["id"] as? String ?? operation
        let found=values.firstIndex { $0.id==id || $0.editKey==id }
        if ["setLike","addComment","removeComment"].contains(action) {
            guard let index=found,let actor=body["actor"] as? String else{return}
            var social=values[index].social ?? Conversation()
            if action=="setLike" { social.likes[actor]=body["liked"] as? Bool ?? false }
            if action=="addComment", let text=body["text"] as? String,!social.comments.contains(where:{$0.id==operation}) {
                social.comments.append(Comment(id:operation,author:actor,text:text,createdAt:pending.createdAt))
            }
            if action=="removeComment" { social.comments.removeAll { $0.id==body["commentId"] as? String } }
            values[index].social=social; values[index].pending=true
        } else if action.hasPrefix("remove") {
            values.removeAll { $0.id==id || $0.editKey==id }
        } else {
            var post=found.map{values[$0]} ?? Post(id:operation)
            post.date=body["date"] as? String ?? ""; post.pending=true
            if found==nil {post.author=body["author"] as? String;post.createdAt=pending.createdAt}
            if isPhoto {
                post.caption=body["caption"] as? String
                if body["photo"] != nil { post.src=photoPath(body) }
            } else {post.text=body["text"] as? String;post.note=body["note"] as? String}
            post.revision=operation;post.editVersion="local:"+operation
            if let index=found {values[index]=post}else{values.append(post)}
        }
        if isPhoto {memories.photos=values}else{memories.quotes=values}
    }
    static func photoPath(_ body:[String:Any])->String {
        let date=body["date"] as? String ?? "2000-01-01"
        return "assets/photos/\(date.prefix(4))/\(date.dropFirst(5).prefix(2))/\(body["operationId"] as? String ?? "").jpg"
    }
}
struct Song: Codable, Identifiable {
    var id: String { String(trackId)+":"+String(rank ?? 0) }
    var trackId: Int
    var title: String
    var artist: String
    var album: String?
    var artworkUrl: String?
    var trackUrl: String?
    var previewUrl: String?
    var rank: Int?
    var note: String?
    var revision: String?
    var savedId: String?
    enum CodingKeys:String,CodingKey {case trackId,title,artist,album,artworkUrl,trackUrl,previewUrl,rank,note,revision;case savedId="id"}
}
struct Wish: Codable, Identifiable {
    var id: String
    var title: String
    var place: String?
    var note: String?
    var completed: Bool?
    var revision: String?
    var photoId: String?
}
struct Translation: Codable, Identifiable {
    var id: String { language }
    var language: String
    var text: String
    var pronunciation: String
    var backTranslation: String
    var note: String
}
