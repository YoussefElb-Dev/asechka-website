import Foundation
import CryptoKit
import Security

/// Keychain key + authenticated encryption; nothing personal is stored as plaintext on disk.
final class Vault: @unchecked Sendable {
    private let directory: URL
    private let key: SymmetricKey
    private let io=DispatchQueue(label:"app.asechka.encrypted-storage",qos:.userInitiated)
    private var unavailableError:Error?
    private init(unavailable error:Error){directory=FileManager.default.temporaryDirectory;key=SymmetricKey(size:.bits256);unavailableError=error}
    static func unavailable(_ error:Error)->Vault{Vault(unavailable:error)}
    init(directory: URL? = nil, key: SymmetricKey? = nil) throws {
        self.directory=directory ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("LittleUs",isDirectory:true)
        try FileManager.default.createDirectory(at:self.directory,withIntermediateDirectories:true)
        var resource=URLResourceValues();resource.isExcludedFromBackup=true
        var folder=self.directory;try folder.setResourceValues(resource)
        self.key=try key ?? Self.loadKey()
    }
    private static func loadKey() throws -> SymmetricKey {
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"app.asechka.vault",kSecAttrAccount as String:"encryption",kSecReturnData as String:true]
        var result:CFTypeRef?
        let status=SecItemCopyMatching(query as CFDictionary,&result)
        if status==errSecSuccess,let bytes=result as? Data {return SymmetricKey(data:bytes)}
        guard status==errSecItemNotFound else{throw CocoaError(.fileReadNoPermission)}
        let key=SymmetricKey(size:.bits256),bytes=key.withUnsafeBytes{Data($0)}
        let add:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"app.asechka.vault",kSecAttrAccount as String:"encryption",kSecValueData as String:bytes,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        guard SecItemAdd(add as CFDictionary,nil)==errSecSuccess else{throw CocoaError(.fileWriteNoPermission)}
        return key
    }
    private func url(_ name:String)->URL {directory.appendingPathComponent(SHA256.hash(data:Data(name.utf8)).map{String(format:"%02x",$0)}.joined())}
    func read(_ name:String)->Data? {
        guard unavailableError==nil else{return nil}
        return io.sync {
        guard let bytes=try? Data(contentsOf:url(name)),let sealed=try? AES.GCM.SealedBox(combined:bytes) else{return nil}
        return try? AES.GCM.open(sealed,using:key,authenticating:Data(name.utf8))
        }
    }
    func write(_ name:String,_ data:Data) throws {
        try io.sync { try writeOnQueue(name,data) }
    }
    private func writeOnQueue(_ name:String,_ data:Data)throws {
        if let unavailableError{throw unavailableError}
        let sealed=try AES.GCM.seal(data,using:key,authenticating:Data(name.utf8))
        guard let bytes=sealed.combined else{throw CocoaError(.fileWriteUnknown)}
        try bytes.write(to:url(name),options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
    }
    func value<T:Decodable>(_ name:String,as:T.Type)->T? {read(name).flatMap{try? JSONDecoder().decode(T.self,from:$0)}}
    func save<T:Encodable>(_ name:String,_ value:T)throws {try write(name,JSONEncoder().encode(value))}
    // FIFO with every other vault operation: a later comment/save or server acknowledgement
    // cannot be overwritten by an older heart snapshot. Encoding and encryption stay off UI.
    func saveDeferred<T:Encodable>(_ name:String,_ value:T,completion:@escaping @Sendable (Error?)->Void) {
        io.async { [self] in
            do { try writeOnQueue(name,JSONEncoder().encode(value));completion(nil) }
            catch { completion(error) }
        }
    }
    func drain()async {await withCheckedContinuation{continuation in io.async{continuation.resume()}}}
    func remove(_ name:String){guard unavailableError==nil else{return};io.sync{_ = try? FileManager.default.removeItem(at:url(name))}}
}
