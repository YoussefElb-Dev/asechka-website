import SwiftUI
import WebKit

struct TimeVaultWebView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var body:some View{NavigationStack{VaultBrowser(universe:universe).ignoresSafeArea(edges:.bottom).navigationTitle("Our time vault").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}}
}
struct VaultBrowser:UIViewRepresentable {
    let universe:UniverseStore
    func makeCoordinator()->Coordinator{Coordinator()}
    func makeUIView(context:Context)->WKWebView{
        let config=WKWebViewConfiguration();config.websiteDataStore = .nonPersistent();config.allowsInlineMediaPlayback=true
        let actor=universe.actor=="asnat" ? "asnat":"youssef"
        config.userContentController.addUserScript(WKUserScript(source:"window.AsechkaActor='\(actor)';",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        let web=WKWebView(frame:.zero,configuration:config);web.navigationDelegate=context.coordinator;web.uiDelegate=context.coordinator;web.isOpaque=false;web.backgroundColor=UIColor(Palette.background)
        Task{@MainActor in if let cookie=universe.browserCookie(){await config.websiteDataStore.httpCookieStore.setCookie(cookie)};web.load(URLRequest(url:URL(string:UniverseStore.site+"/vault.html")!))}
        return web
    }
    func updateUIView(_ web:WKWebView,context:Context){}
    static func dismantleUIView(_ web:WKWebView,coordinator:Coordinator){web.evaluateJavaScript("window.dispatchEvent(new Event('pagehide'))");web.stopLoading();web.configuration.websiteDataStore.httpCookieStore.getAllCookies{cookies in for cookie in cookies{web.configuration.websiteDataStore.httpCookieStore.delete(cookie)}}}
    final class Coordinator:NSObject,WKNavigationDelegate,WKUIDelegate {
        func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){guard let url=action.request.url else{decisionHandler(.cancel);return};decisionHandler(url.scheme=="https"&&url.host=="asechka-website.vercel.app" ? .allow:.cancel)}
        func webView(_ webView:WKWebView,requestMediaCapturePermissionFor origin:WKSecurityOrigin,initiatedByFrame frame:WKFrameInfo,type:WKMediaCaptureType,decisionHandler:@escaping(WKPermissionDecision)->Void){decisionHandler(origin.host=="asechka-website.vercel.app"&&type == .camera ? .prompt:.deny)}
    }
}
