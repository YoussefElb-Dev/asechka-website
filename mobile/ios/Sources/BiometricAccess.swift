import Foundation
import LocalAuthentication

/// Optional native OS authentication, including the phone passcode as a fallback.
@MainActor enum BiometricAccess {
    private static var context:LAContext?
    static var available:Bool{LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,error:nil)}
    static var name:String{let value=LAContext();_ = value.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,error:nil);return value.biometryType == .faceID ? "Face ID":"Touch ID"}
    static var symbol:String{name=="Face ID" ? "faceid":"touchid"}
    static func cancel(){context?.invalidate();context=nil}
    static func remove(){cancel()}
    static func authenticate(enroll:Bool)async throws {
        let auth=LAContext();context=auth
        defer{if context === auth{context=nil}}
        let accepted=try await auth.evaluatePolicy(.deviceOwnerAuthentication,localizedReason:enroll ? "Enable optional biometric unlock for our little universe.":"Open our private little universe.")
        if !accepted{throw CocoaError(.userCancelled)}
    }
}
