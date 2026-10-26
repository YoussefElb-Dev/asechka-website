import Foundation
import SwiftUI
import CryptoKit
import Network

struct ServerError: LocalizedError {
    let message:String
    let status:Int
    var errorDescription:String? {message}
}
final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {completionHandler(nil)}
}
@MainActor final class UniverseStore: ObservableObject {
    static let site="https://asechka-website.vercel.app"
    @Published var actor=UserDefaults.standard.string(forKey:"person") ?? ""
    @Published var unlocked=false
    @Published private(set) var requiresCode=true
    @Published var doorError:String?
    @Published private(set) var biometricEnabled=false
    private var biometricPrompt=false
    private var accessEpoch=0
    @Published var memories=Memories()
    @Published var songs:[Song]=[]
    @Published var wishes:[Wish]=[]
    @Published var journal:[String:Any]=[:]
    @Published var keepsakes:[String:Any]=[:]
    @Published var translations:[Translation]=[]
    @Published var pending:[PendingChange]=[]
    @Published var message="Opening our little universe…"
    @Published var online=true
    @Published var busy=false
    @Published var error:String?
    @Published var bookmarks:Set<String>=[]
    @Published var hearts:[String:String]=[:]
    @Published var heartDays:[String:[String:Int]]=[:]
    @Published var heartStreakPolicy:[String:Any]=[:]
    @Published var serverHeartDay=""
    private var serverHeartAsOf:Date?
    private var refreshingHearts=false
    private var streakCacheKey=""
    private var streakCache:SharedHeartStreak?
    func sharedHeartStreak(at date:Date=Date())->SharedHeartStreak {
        let today=online && !serverHeartDay.isEmpty && abs(date.timeIntervalSince(serverHeartAsOf ?? .distantPast))<90 ? serverHeartDay:HeartLedger.day(date)
        // Repeated hearts change totals, but cannot change the streak again that day.
        let activeDays=heartDays.keys.filter{(heartDays[$0]?["me"] ?? 0)>0 || (heartDays[$0]?["asechka"] ?? 0)>0}.sorted().joined(separator:",")
        let key="\(today)|\(heartStreakPolicy["startedOn"] ?? "")|\(heartStreakPolicy["seededThrough"] ?? "")|\(heartStreakPolicy["seedDays"] ?? 13)|\(activeDays)"
        if key==streakCacheKey,let result=streakCache{return result}
        let result=SharedHeartStreak.calculate(heartDays,policy:heartStreakPolicy,today:today)
        streakCacheKey=key;streakCache=result;return result
    }
    private func saveTogether(_ data:Data)throws {
        let incoming=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] ?? [:]
        if let saved=vault.read("snapshot:/api/together"), let current=(try? JSONSerialization.jsonObject(with:saved)) as? [String:Any],
           ((current["updatedAt"] as? String ?? "") > (incoming["updatedAt"] as? String ?? "") ||
            ((current["updatedAt"] as? String ?? "") == (incoming["updatedAt"] as? String ?? "") &&
             ((current["streakStatus"] as? [String:Any])?["asOf"] as? String ?? "") > ((incoming["streakStatus"] as? [String:Any])?["asOf"] as? String ?? ""))) {return}
        try vault.write("snapshot:/api/together",data)
    }
    func refreshSharedHearts()async {
        guard unlocked,!locked,online,!cookie.isEmpty,!refreshingHearts else{return}
        refreshingHearts=true;defer{refreshingHearts=false}
        await sync()
        do {let data=try await request("/api/together");guard !locked else{return};try saveTogether(data);restore();status()}catch{}
    }
    private var heartReceipts:Set<String>=[]
    private var inFlightChange:String?
    private var sealedHearts:Set<String>=[]
    private var heartFlush:Task<Void,Never>?
    private var heartCommit:Task<Void,Never>?
    private var heartTaps:[String:Int]=[:]
    private var retryAfter=Date.distantPast
    @Published var dailyText=""
    private(set) var storageUnavailable=false
    let vault:Vault
    private let session:URLSession
    private let monitor=NWPathMonitor()
    private var cookie=""
    private var refreshing=false
    private var syncing=false
    private var prefetching=false
    private var locked=false
    private var idMap:[String:String]=[:]
    var name:String {Post.name(actor)}
    var partner:String {actor=="asnat" ? "Youssef" : "Asnat"}
    init(previewFixture:Bool=false) {
        // A storage failure is shown to the user rather than silently falling back to plaintext.
        #if DEBUG
        let preview=previewFixture || ProcessInfo.processInfo.arguments.contains("--preview-fixture")
        #else
        let preview=false
        #endif
        do{vault=try preview ? Vault(directory:FileManager.default.temporaryDirectory.appendingPathComponent("Preview-"+UUID().uuidString),key:SymmetricKey(size:.bits256)):Vault()}
        catch{vault=Vault.unavailable(error);storageUnavailable=true}
        let config=URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies=false;config.httpCookieStorage=nil;config.urlCache=nil
        config.timeoutIntervalForRequest=60;config.timeoutIntervalForResource=75
        session=URLSession(configuration:config,delegate:NoRedirect(),delegateQueue:nil)
        guard !storageUnavailable else{return}
        biometricEnabled=vault.value("biometric-enabled",as:Bool.self) ?? false
        if preview {
            actor="asnat";unlocked=true;online=false;memories=bundledMemories()
            requiresCode=ProcessInfo.processInfo.arguments.contains("--preview-lock")
            let salt=UUID().uuidString;try? vault.save("offline-code",[salt,Self.verifier("123456",salt)])
            try? vault.save("snapshot:/api/memories",memories);restore();journal["writable"]=true;keepsakes["writable"]=true;try? vault.write("snapshot:/api/journal",JSONSerialization.data(withJSONObject:journal));try? vault.write("snapshot:/api/keepsakes",JSONSerialization.data(withJSONObject:keepsakes));status();return
        }
        cookie=vault.value("session",as:String.self) ?? ""
        locked=vault.value("locked",as:Bool.self) ?? false
        unlocked = !locked && vault.read("snapshot:/api/memories") != nil
        pending=vault.value("outbox",as:[PendingChange].self) ?? []
        for index in pending.indices where pending[index].error != nil {
            if let body=(try? JSONSerialization.jsonObject(with:pending[index].body)) as? [String:Any],pending[index].path=="/api/together",body["action"] as? String=="sendHeart"{pending[index].error=nil;sealedHearts.insert(pending[index].id)}
        }
        try? vault.save("outbox",pending)
        sealedHearts.formUnion(vault.value("heart-sealed",as:[String].self) ?? [])
        idMap=vault.value("id-map",as:[String:String].self) ?? [:]
        restore();loadBookmarks()
        monitor.pathUpdateHandler={ [weak self] path in
            Task { @MainActor in
                guard let self else{return};self.online=path.status == .satisfied
                if self.online && self.unlocked {await self.refresh()}else{self.status()}
            }
        };monitor.start(queue:DispatchQueue(label:"app.asechka.connection"))
    }
    func choose(_ value:String){actor=value;UserDefaults.standard.set(value,forKey:"person");loadBookmarks();restore()}
    func loadBookmarks(){bookmarks=Set(vault.value("bookmarks:"+actor,as:[String].self) ?? [])}
    func bookmark(_ post:Post){if !bookmarks.insert(post.key).inserted{bookmarks.remove(post.key)};do{try vault.save("bookmarks:"+actor,Array(bookmarks))}catch{self.error=error.localizedDescription}}
    func status(){message = !online ? "Offline · showing saved content" : cookie.isEmpty ? "Reconnect with our code to sync" : "Up to date · saved on this phone"
        if !pending.isEmpty {message += pending.contains(where:{$0.error != nil}) ? " · changes need review" : " · \(pending.count) waiting to sync"}
    }
    func request(_ path:String,body:Data?=nil,form:Bool=false)async throws->Data {
        guard path.hasPrefix("/"),!path.hasPrefix("//"),!path.contains("\\"),let url=URL(string:Self.site+path)else{throw URLError(.badURL)}
        var request=URLRequest(url:url);request.httpMethod=body==nil ? "GET":"POST";request.httpBody=body
        request.setValue("application/json",forHTTPHeaderField:"Accept");request.setValue(Self.site,forHTTPHeaderField:"Origin")
        request.setValue("no-store",forHTTPHeaderField:"Cache-Control");request.setValue("Asechka-iOS/2.2.5",forHTTPHeaderField:"User-Agent")
        if !cookie.isEmpty {request.setValue(cookie,forHTTPHeaderField:"Cookie")}
        if body != nil {request.setValue(form ? "application/x-www-form-urlencoded":"application/json",forHTTPHeaderField:"Content-Type")}
        for (endpoint,header) in [("/api/journal","X-Asechka-Journal"),("/api/keepsakes","X-Asechka-Keepsakes"),("/api/memories","X-Asechka-Memories"),("/api/music","X-Asechka-Music"),("/api/together","X-Asechka-Together"),("/api/translation","X-Asechka-Translation")] {
            if path==endpoint {request.setValue("1",forHTTPHeaderField:header)}
        }
        let (data,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse else{throw URLError(.badServerResponse)}
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode==401 {cookie="";vault.remove("session");status()}
            let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
            throw ServerError(message:json?["error"] as? String ?? "Our connection needs a little moment. Your saved content is here.",status:http.statusCode)
        }
        if path=="/api/session" {
            let headers=http.allHeaderFields.reduce(into:[String:String]()){ if let key=$1.key as? String,let value=$1.value as? String {$0[key]=value} }
            if let value=HTTPCookie.cookies(withResponseHeaderFields:headers,for:url).first(where:{$0.name=="asechka_session"}) {
                cookie=value.name+"="+value.value;try vault.save("session",cookie)
            }
        }
        return data
    }
    func requireCode(background:Bool=false){
        if biometricPrompt && !background{HeartRain.shared.stop();return}
        if background{BiometricAccess.cancel();biometricPrompt=false}
        flushHeartTaps();accessEpoch += 1;requiresCode=true;busy=false;doorError=nil;HeartRain.shared.stop()
    }
    func setBiometrics(_ enabled:Bool)async {
        if !enabled{BiometricAccess.remove();biometricEnabled=false;try? vault.save("biometric-enabled",false);return}
        guard unlocked,!requiresCode,BiometricAccess.available else{return}
        let visit=accessEpoch;biometricPrompt=true
        defer{biometricPrompt=false}
        do{try await BiometricAccess.authenticate(enroll:true);guard visit==accessEpoch else{return};try vault.save("biometric-enabled",true);biometricEnabled=true}
        catch{if visit==accessEpoch{self.error="Biometrics weren’t enabled. Our code still works."}}
    }
    func biometricLogin()async {
        guard !busy,biometricEnabled,BiometricAccess.available,vault.read("snapshot:/api/memories") != nil else{return}
        let visit=accessEpoch;biometricPrompt=true;busy=true;doorError=nil
        defer{biometricPrompt=false;if visit==accessEpoch{busy=false}}
        do{
            try await BiometricAccess.authenticate(enroll:false)
            guard visit==accessEpoch else{return}
            locked=false;try vault.save("locked",false);unlocked=true;requiresCode=false;restore();status();Touch.tap(true);await refresh()
        }catch{if visit==accessEpoch{doorError="Use our little code, or try \(BiometricAccess.name) again."}}
    }
    func login(_ code:String)async {
        guard !busy else{return}
        guard !code.isEmpty else{doorError="Enter our little code first.";return}
        let visit=accessEpoch
        busy=true;doorError=nil
        defer{if visit==accessEpoch{busy=false}}
        func accept()async {
            guard visit==accessEpoch else{return}
            locked=false;try? vault.save("locked",false);unlocked=true;requiresCode=false;restore();status();Touch.tap(true)
            await refresh()
        }
        func savedCodeMatches()->Bool {
            guard let check=vault.value("offline-code",as:[String].self),check.count==2,vault.read("snapshot:/api/memories") != nil else{return false}
            return Self.verifier(code,check[0])==check[1]
        }
        if !online {
            if savedCodeMatches(){await accept()}
            else{doorError="Use the code last used on this phone, or connect to open it for the first time."}
            return
        }
        do {
            var components=URLComponents();components.queryItems=[URLQueryItem(name:"password",value:code)]
            _=try await request("/api/session",body:Data((components.percentEncodedQuery ?? "").replacingOccurrences(of:"+",with:"%2B").utf8),form:true)
            guard visit==accessEpoch else{return}
            let salt=UUID().uuidString
            try vault.save("offline-code",[salt,Self.verifier(code,salt)])
            await accept()
        }catch {
            guard visit==accessEpoch else{return}
            if (error as? ServerError)?.status != 401,savedCodeMatches(){await accept()}
            else{doorError=(error as? ServerError)?.status == 401 ? "That code needs another little try. ♡":error.localizedDescription}
        }
    }
    static func verifier(_ code:String,_ salt:String)->String {
        // The verifier is itself encrypted by the device-only Keychain key.
        SHA256.hash(data:Data((salt+":"+code).utf8)).map{String(format:"%02x",$0)}.joined()
    }
    func lock(){requireCode();locked=true;unlocked=false;try? vault.save("locked",true);cookie="";vault.remove("session")}
    func restore(){
        heartDays=[:];heartReceipts=[];heartStreakPolicy=[:];serverHeartDay="";serverHeartAsOf=nil
        memories=vault.value("snapshot:/api/memories",as:Memories.self) ?? bundledMemories()
        songs=(vault.read("snapshot:/api/music").flatMap{try? JSONDecoder().decode(SongList.self,from:$0)})?.tracks ?? []
        wishes=(vault.read("snapshot:/api/together").flatMap{try? JSONDecoder().decode(WishList.self,from:$0)})?.bucketList ?? []
        if let data=vault.read("snapshot:/api/together"),let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
            let values=json["hearts"] as? [String:Any] ?? [:]
            heartStreakPolicy=json["heartStreak"] as? [String:Any] ?? [:]
            serverHeartDay=(json["streakStatus"] as? [String:Any])?["today"] as? String ?? ""
            serverHeartAsOf=BookDates.instant((json["streakStatus"] as? [String:Any])?["asOf"] as? String ?? "")
            hearts=values.compactMapValues{($0 as? [String:Any])?["sentAt"] as? String}
            heartDays=json["heartDays"] as? [String:[String:Int]] ?? [:]
            heartReceipts=Set(json["heartReceipts"] as? [String] ?? [])
        }
        if let data=vault.read("snapshot:/api/daily-memory"),let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
            let memory=json["memory"] as? [String:Any]
            dailyText=memory?["text"] as? String ?? memory?["caption"] as? String ?? memory?["title"] as? String ?? "A new little moment, every day."
        }
        journal=restoreBook("/api/journal","journal");keepsakes=restoreBook("/api/keepsakes","keepsakes")
        translations=vault.value("translations:"+actor,as:[Translation].self) ?? []
        for change in pending {Projection.apply(change,to:&memories);projectOther(change)}
    }
    private func bundledMemories()->Memories {
        guard let url=Bundle.main.url(forResource:"memories",withExtension:"json",subdirectory:"default"),let data=try? Data(contentsOf:url)else{return Memories()}
        return (try? JSONDecoder().decode(Memories.self,from:data)) ?? Memories()
    }
    func refresh()async {
        guard !refreshing,unlocked,!locked,online else{status();return}
        refreshing=true;defer{refreshing=false;status()}
        await sync()
        for path in ["/api/memories","/api/music","/api/together","/api/daily-memory","/api/keepsakes","/api/journal"] {
            do{let data=try await request(path);guard !locked else{return};if path=="/api/together"{try saveTogether(data)}else{try vault.write("snapshot:"+path,data)}}
            catch{if vault.read("snapshot:"+path)==nil {self.error=error.localizedDescription}}
        }
        guard !locked else{return};restore();await prefetch()
    }
    func sendHeart()throws {
        let key=(actor=="asnat" ? "asechka":"me")+"|"+HeartLedger.day()
        heartTaps[key,default:0]+=1
        guard heartCommit==nil else{return}
        // The particle starts immediately; save/count updates coalesce without rebuilding the feed per tap.
        heartCommit=Task{try? await Task.sleep(nanoseconds:80_000_000);guard !Task.isCancelled else{return};flushHeartTaps()}
    }
    private func flushHeartTaps(){
        heartCommit?.cancel();heartCommit=nil
        guard !heartTaps.isEmpty else{return}
        let taps=heartTaps;heartTaps=[:]
        var next=pending,days=heartDays,newHearts=hearts
        do {
            for (key,count) in taps {
                let parts=key.split(separator:"|").map(String.init),from=parts[0],day=parts[1]
                var merged=false
                for index in next.indices.reversed() where next[index].path=="/api/together" && next[index].error==nil && next[index].id != inFlightChange && !sealedHearts.contains(next[index].id) {
                    guard var body=(try? JSONSerialization.jsonObject(with:next[index].body)) as? [String:Any],body["action"] as? String=="sendHeart",body["from"] as? String==from,body["day"] as? String==day,(body["count"] as? Int ?? 1)+count<=1000000 else{continue}
                    body["count"]=(body["count"] as? Int ?? 1)+count;next[index].body=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys]);merged=true;break
                }
                if !merged {
                    let body:[String:Any]=["action":"sendHeart","from":from,"day":day,"count":count,"operationId":UUID().uuidString.lowercased()]
                    next.append(PendingChange(id:UUID().uuidString,path:"/api/together",body:try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys]),createdAt:ISO8601DateFormatter().string(from:Date())))
                }
                days[day,default:[:]][from,default:0]+=count;newHearts[from]=ISO8601DateFormatter().string(from:Date())
            }
            pending=next;heartDays=days;hearts=newHearts
            vault.saveDeferred("outbox",next){[weak self] error in
                guard let error else{return}
                Task{@MainActor in self?.error="Your phone couldn’t finish saving those hearts. Please keep the app open and try again. "+error.localizedDescription}
            }
            status()
            heartFlush?.cancel();heartFlush=Task{do{try await Task.sleep(nanoseconds:1_200_000_000)}catch{return};heartFlush=nil;await sync();restore();status()}
        }catch{heartTaps.merge(taps,uniquingKeysWith:+);self.error=error.localizedDescription}
    }
    func finishHeartSaves()async {flushHeartTaps();await vault.drain()}

    func forceRefresh()async {
        retryAfter = .distantPast
        await finishHeartSaves()
        // Only hearts can be safely retried without a person resolving a stale edit.
        var next=pending,recovered=false
        for index in next.indices where next[index].error != nil {
            guard let body=(try? JSONSerialization.jsonObject(with:next[index].body)) as? [String:Any],next[index].path=="/api/together",body["action"] as? String=="sendHeart" else{continue}
            next[index].error=nil;recovered=true
        }
        if recovered {do{try vault.save("outbox",next);pending=next}catch{self.error=error.localizedDescription}}
        await refresh()
    }

    func enqueue(_ path:String,_ input:[String:Any])throws {
        var body=input
        if body["operationId"]==nil {body["operationId"]=UUID().uuidString.lowercased()}
        let data=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys])
        if let encoded=body["photo"] as? String,let bytes=Data(base64Encoded:String(encoded.dropFirst(23))) {
            let key=path=="/api/journal" ? "/api/journal?photo=\(body["operationId"] as? String ?? "")" : path=="/api/memories" ? "/"+Projection.photoPath(body) : "/api/together-photo?kind=bucket&id=\(body["operationId"] as? String ?? "")"
            try vault.write("image:"+key,bytes)
        }
        let change=PendingChange(id:UUID().uuidString,path:path,body:data,createdAt:ISO8601DateFormatter().string(from:Date()))
        var next=pending;next.append(change);try vault.save("outbox",next);pending=next;restore();status()
        Task{await sync();restore();status()}
    }
    func sync()async {
        guard !syncing,online,!cookie.isEmpty,!locked,Date()>=retryAfter else{return};flushHeartTaps();syncing=true;defer{syncing=false;inFlightChange=nil}
        var batches=0
        while !locked {
            guard let first=pending.first?.error==nil ? pending.first:pending.first(where:{change in
                guard change.error==nil,change.path=="/api/together",let body=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any] else{return false}
                return body["action"] as? String=="sendHeart"
            }) else{break}
            let isHeart=((try? JSONSerialization.jsonObject(with:first.body)) as? [String:Any])?["action"] as? String=="sendHeart"
            if isHeart{batches += 1;if batches>2{break}}
            inFlightChange=first.id
            do {
                var body=(try JSONSerialization.jsonObject(with:first.body)) as? [String:Any] ?? [:]
                if body["action"] as? String=="sendHeart" {sealedHearts.insert(first.id);try vault.save("heart-sealed",Array(sealedHearts))}
                for field in ["expectedVersion","expectedId","expectedRevision"] {
                    if var value=body[field] as? String {for _ in 0..<50 {guard let next=idMap[value] else{break};value=next};body[field]=value}
                }
                let data=try await request(first.path,body:JSONSerialization.data(withJSONObject:body))
                guard !locked else{return}
                if first.path=="/api/memories",let saved=try? JSONDecoder().decode(Memories.self,from:data),let op=body["operationId"] as? String {
                    let id=body["id"] as? String ?? op
                    if let post=saved.posts.first(where:{$0.id==id}),let version=post.editVersion {idMap["local:"+op]=version}
                }
                if let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
                    if first.path=="/api/together",let list=json["bucketList"] as? [[String:Any]],let op=body["operationId"] as? String,
                       let value=list.first(where:{$0["id"] as? String==body["id"] as? String})?["revision"] as? String {idMap[op]=value}
                    if first.path=="/api/music",let list=json["tracks"] as? [[String:Any]],let value=list.first(where:{$0["rank"] as? Int==body["rank"] as? Int})?["id"] as? String {idMap[first.id]=value}
                }
                // Persist the server snapshot before dropping the queued operation. Retried writes are idempotent.
                if first.path=="/api/together"{try saveTogether(data)}else{try vault.write("snapshot:"+first.path,data)};try vault.save("id-map",idMap)
                var next=pending;next.removeAll{$0.id==first.id};try vault.save("outbox",next);pending=next
                sealedHearts.remove(first.id);try? vault.save("heart-sealed",Array(sealedHearts))
            }catch {
                retryAfter=Date().addingTimeInterval(5)
                if isHeart,(error as? ServerError)?.status==409 {
                    if await reconcileHeart(first){continue}
                    break
                }
                if let server=error as? ServerError,(400..<500).contains(server.status),![401,429].contains(server.status),let index=pending.firstIndex(where:{$0.id==first.id}) {
                    pending[index].error=server.message;try? vault.save("outbox",pending)
                };break
            }
        }
    }
    private func reconcileHeart(_ change:PendingChange)async->Bool {
        do {
            guard let body=(try JSONSerialization.jsonObject(with:change.body)) as? [String:Any],let op=body["operationId"] as? String else{return false}
            let data=try await request("/api/together?heartOperation="+op)
            guard let response=(try JSONSerialization.jsonObject(with:data)) as? [String:Any],let receipt=response["heartReceipt"] as? [String:Any],receipt["operationId"] as? String==op,receipt["from"] as? String==body["from"] as? String,
                  body["day"]==nil || body["day"] as? String==receipt["day"] as? String,let accepted=receipt["count"] as? Int,accepted>0 else{return false}
            let rest=max(0,(body["count"] as? Int ?? 1)-accepted)
            var next=pending
            guard let index=next.firstIndex(where:{$0.id==change.id}) else{return true}
            if rest>0 {
                var replacement=body;replacement["count"]=rest;replacement["operationId"]=UUID().uuidString.lowercased()
                next[index]=PendingChange(id:UUID().uuidString,path:change.path,body:try JSONSerialization.data(withJSONObject:replacement,options:[.sortedKeys]),createdAt:change.createdAt)
            }else{next.remove(at:index)}
            try saveTogether(data);try vault.save("outbox",next);pending=next
            sealedHearts.remove(change.id);try? vault.save("heart-sealed",Array(sealedHearts));restore();status();return true
        }catch{return false}
    }
    func discard(_ change:PendingChange){do{var next=pending;next.removeAll{$0.id==change.id};try vault.save("outbox",next);pending=next;restore();status()}catch{self.error=error.localizedDescription}}
    private func projectOther(_ change:PendingChange){
        guard let b=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any] else{return}
        if change.path=="/api/together" {
            let action=b["action"] as? String ?? ""
            if action=="sendHeart" {HeartLedger.apply(b,to:&heartDays,receipts:heartReceipts,createdAt:change.createdAt);hearts[b["from"] as? String ?? "me"]=change.createdAt;return}
            guard let id=b["id"] as? String else{return}
            if action=="removeItem"{wishes.removeAll{$0.id==id};return}
            if let index=wishes.firstIndex(where:{$0.id==id}) {
                if action=="saveItem" {wishes[index].title=b["title"] as? String ?? wishes[index].title;wishes[index].place=b["place"] as? String;wishes[index].note=b["note"] as? String}
                wishes[index].completed=b["completed"] as? Bool;wishes[index].revision=b["operationId"] as? String
                if b["photo"] != nil {wishes[index].photoId=b["operationId"] as? String}
            }else if action=="saveItem" {wishes.append(Wish(id:id,title:b["title"] as? String ?? "",place:b["place"] as? String,note:b["note"] as? String,completed:b["completed"] as? Bool,revision:b["operationId"] as? String,photoId:b["photo"] != nil ? b["operationId"] as? String:nil))}
        }
        if change.path=="/api/music",let rank=b["rank"] as? Int {
            songs.removeAll{$0.rank==rank}
            if b["action"] as? String=="save",let id=b["trackId"] as? Int,var song=vault.value("song:\(id)",as:Song.self) {song.rank=rank;song.savedId=change.id;song.revision=change.id;song.note=b["note"] as? String;songs.append(song)}
            songs.sort{($0.rank ?? 0)<($1.rank ?? 0)}
        }
    }
    func like(_ post:Post,_ liked:Bool){do{try enqueue("/api/memories",["action":"setLike","kind":post.kind,"id":post.id,"actor":actor,"liked":liked])}catch{self.error=error.localizedDescription}}
    func comment(_ post:Post,_ text:String)throws{try enqueue("/api/memories",["action":"addComment","kind":post.kind,"id":post.id,"actor":actor,"text":text])}
    func current(_ post:Post)->Post{memories.posts.first{$0.id==post.id} ?? post}
    func image(_ source:String)async->Data? {
        guard !source.isEmpty else{return nil}
        var cache=source,bundled=source.trimmingCharacters(in:CharacterSet(charactersIn:"/"))
        if source.hasPrefix("/api/together-photo?kind=memory"),let parts=URLComponents(string:source),let id=parts.queryItems?.first(where:{$0.name=="id"})?.value,
           let photo=memories.photos.first(where:{$0.id==id}),let src=photo.src {cache="/"+src;bundled=src}
        if bundled.hasPrefix("assets/"),!bundled.contains(".."),let url=Bundle.main.url(forResource:String(bundled.dropFirst(7)),withExtension:nil,subdirectory:"default"),let data=try? Data(contentsOf:url){return data}
        if let data=vault.read("image:"+cache){return data}
        guard online else{return nil}
        do {
            let data:Data
            if source.hasPrefix("https://"),let url=URL(string:source),url.host?.hasSuffix(".mzstatic.com")==true {
                let (bytes,response)=try await session.data(from:url);guard (response as? HTTPURLResponse)?.statusCode==200,bytes.count<12_000_000 else{return nil};data=bytes
            }else{data=try await request(source.hasPrefix("/") ? source : "/"+source)}
            guard data.count<12_000_000 else{return nil};try vault.write("image:"+cache,data);return data
        }catch{return nil}
    }
    func prefetch()async {
        guard !prefetching else{return};prefetching=true;defer{prefetching=false}
        let sources=memories.photos.map(\.imageURL)+songs.compactMap(\.artworkUrl)+wishes.compactMap{$0.photoId.map{"/api/together-photo?kind=bucket&id="+$0}}
        let recipePhotos=(journal["recipes"] as? [[String:Any]] ?? []).compactMap{$0["photoId"] as? String}.map{"/api/journal?photo="+$0}
        for source in sources+recipePhotos {guard online,!locked else{return};_=await image(source)}
    }
    func search(_ query:String)async throws->[Song]{
        var parts=URLComponents();parts.queryItems=[URLQueryItem(name:"q",value:query)]
        let path="/api/music-search?"+(parts.percentEncodedQuery ?? "").replacingOccurrences(of:"+",with:"%2B")
        let data:Data
        if !online,let saved=vault.read("search:"+path){data=saved}else{data=try await request(path);try vault.write("search:"+path,data)}
        let list=try JSONDecoder().decode(SongList.self,from:data)
        for song in list.tracks{try vault.save("song:\(song.trackId)",song)};return list.tracks
    }
    func translate(_ text:String,source:String,tone:String,targets:[String])async throws {
        let body:[String:Any]=["text":text,"source":source,"tone":tone,"targets":targets,"speaker":actor=="asnat" ? "female":"male","recipient":actor=="asnat" ? "male":"female"]
        let encoded=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys])
        let key="translation:"+SHA256.hash(data:encoded).map{String(format:"%02x",$0)}.joined()
        let data:Data
        if !online,let saved=vault.read(key){data=saved}else{data=try await request("/api/translation",body:encoded);try vault.write(key,data)}
        translations=try JSONDecoder().decode(TranslationList.self,from:data).translations
        try vault.save("translations:"+actor,translations)
        var history=vault.value("translation-history:"+actor,as:[TranslationRecord].self) ?? []
        history.insert(TranslationRecord(id:UUID().uuidString,text:text,results:translations),at:0)
        try vault.save("translation-history:"+actor,Array(history.prefix(30)))
    }
}
struct SongList:Decodable {var tracks:[Song]}
struct WishList:Decodable {var bucketList:[Wish]}
struct TranslationList:Decodable {var translations:[Translation]}
struct TranslationRecord:Codable,Identifiable {var id:String;var text:String;var results:[Translation]}
