import Foundation
import LocalAuthentication
import Security

/// The system protects a device-only proof with the currently enrolled biometrics.
@MainActor enum BiometricAccess {
    private static let service="app.asechka.biometric-door"
    private static let proof=Data("Only us, always. Asechka biometric door.".utf8)
    private static var context:LAContext?
    static var available:Bool{LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,error:nil)}
    static var name:String{let value=LAContext();_ = value.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,error:nil);return value.biometryType == .faceID ? "Face ID":"Touch ID"}
    static var symbol:String{name=="Face ID" ? "faceid":"touchid"}
    static func cancel(){context?.invalidate();context=nil}
    static func remove(){SecItemDelete([kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"door"] as CFDictionary)}
    static func authenticate(enroll:Bool)async throws {
        let auth=LAContext();auth.localizedFallbackTitle="Use our code";context=auth
        defer{if context === auth{context=nil}}
        try await auth.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,localizedReason:enroll ? "Keep our little universe close with \(name).":"Open our private little universe.")
        if enroll {
            var error:Unmanaged<CFError>?
            guard let control=SecAccessControlCreateWithFlags(nil,kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,.biometryCurrentSet,&error)else{throw CocoaError(.fileWriteNoPermission)}
            remove()
            let item:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"door",kSecValueData as String:proof,kSecAttrAccessControl as String:control,kSecUseAuthenticationContext as String:auth]
            guard SecItemAdd(item as CFDictionary,nil)==errSecSuccess else{throw CocoaError(.fileWriteNoPermission)}
        }else {
            let item:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"door",kSecReturnData as String:true,kSecUseAuthenticationContext as String:auth]
            var data:CFTypeRef?
            guard SecItemCopyMatching(item as CFDictionary,&data)==errSecSuccess,data as? Data==proof else{throw CocoaError(.fileReadNoPermission)}
        }
    }
}
