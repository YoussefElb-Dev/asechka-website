import SwiftUI
import CoreLocation
import MapKit

struct SharedPosition:Decodable {let latitude:Double;let longitude:Double;let accuracy:Double;let capturedAt:Double}
struct LocationPerson:Decodable,Identifiable {
    let actor:String;let sharing:Bool;let live:Bool;let position:SharedPosition?
    var id:String{actor}
    var name:String{actor=="asnat" ? "Asnat":"Youssef"}
    var coordinate:CLLocationCoordinate2D{CLLocationCoordinate2D(latitude:position?.latitude ?? 0,longitude:position?.longitude ?? 0)}
    func status(at date:Date)->String{guard let p=position else{return sharing ? "Waiting for GPS":"Not sharing"};let age=max(0,Int(date.timeIntervalSince1970-p.capturedAt/1000));return age>300 ? "No recent location":age<60 ? "Live · ±\(Int(p.accuracy)) m":"\(age/60)m ago · paused"}
}
struct LocationSnapshot:Decodable {let serverTime:Double;let people:[LocationPerson];var token:String?}
@MainActor final class LiveLocationModel:NSObject,ObservableObject,CLLocationManagerDelegate {
    @Published var people:[LocationPerson]=[]
    @Published var sharing=false
    @Published var stopPending=false
    @Published var message="Only shared when you choose."
    @Published var busy=false
    private weak var universe:UniverseStore?
    private let manager=CLLocationManager()
    private var token="",actor="",lastSent=Date.distantPast
    private var active=false,requesting=false,sending=false
    private var pending:CLLocation?
    init(universe:UniverseStore){self.universe=universe;super.init();manager.delegate=self;manager.desiredAccuracy=kCLLocationAccuracyBest;manager.distanceFilter=kCLDistanceFilterNone;manager.pausesLocationUpdatesAutomatically=false
        // With Always permission, leave the persistent background indicator off.
        // iOS still controls its privacy indicators and requires one for When In Use.
        manager.showsBackgroundLocationIndicator=false
        if let saved=universe.vault.value("live-location-consent",as:[String:String].self){actor=saved["actor"] ?? "";token=saved["token"] ?? "";stopPending=saved["stopping"]=="1";sharing = !token.isEmpty && !stopPending}
    }
    func configure(active:Bool){self.active=active;guard let u=universe,u.unlocked,!u.requiresCode else{if !sharing{manager.stopUpdatingLocation()};return};if stopPending && active{stop()};if sharing{resume()};if active{Task{await refresh()}}}
    func resume(){guard sharing else{return};let auth=manager.authorizationStatus;guard auth == .authorizedAlways || auth == .authorizedWhenInUse else{message="Location permission is off. Open Settings to continue sharing.";return};manager.allowsBackgroundLocationUpdates=true;manager.startUpdatingLocation();manager.startMonitoringSignificantLocationChanges();message=auth == .authorizedAlways ? "Sharing until you stop · background enabled":"Sharing until you stop · allow Always in Settings"}
    func start(){guard let u=universe,!busy,!u.actor.isEmpty else{return};requesting=true;switch manager.authorizationStatus{case .notDetermined:manager.requestWhenInUseAuthorization();case .authorizedAlways,.authorizedWhenInUse:begin();default:message="Allow location in iPhone Settings to share."}}
    private func begin(){guard requesting,let u=universe,!busy else{return};requesting=false;busy=true
        Task{defer{busy=false};do{let body=try JSONSerialization.data(withJSONObject:["action":"start","actor":u.actor]);let data=try await u.request("/api/location",body:body);let result=try JSONDecoder().decode(LocationSnapshot.self,from:data);guard let value=result.token else{return};actor=u.actor;token=value;try u.vault.save("live-location-consent",["actor":actor,"token":token]);sharing=true;people=result.people;resume();if manager.authorizationStatus == .authorizedWhenInUse{manager.requestAlwaysAuthorization()}}catch{message=error.localizedDescription}}
    }
    func stop(){guard let u=universe,!busy else{return};manager.stopUpdatingLocation();manager.stopMonitoringSignificantLocationChanges();busy=true;sharing=false;stopPending=true;pending=nil;try? u.vault.save("live-location-consent",["actor":actor,"token":token,"stopping":"1"]);message="Stopping sharing…"
        Task{defer{busy=false};do{let data=try await u.request("/api/location",body:JSONSerialization.data(withJSONObject:["action":"stop","actor":actor,"token":token]));people=try JSONDecoder().decode(LocationSnapshot.self,from:data).people;clear();message="Location sharing is off."}catch let e as ServerError where e.status==409{clear();message="Location sharing has ended on this device."}catch{message="Sharing paused here. Connect and tap Stop again to remove the shared pin."}}
    }
    private func clear(){sharing=false;stopPending=false;token="";universe?.vault.remove("live-location-consent");manager.stopUpdatingLocation();manager.stopMonitoringSignificantLocationChanges()}
    func refresh()async{guard let u=universe,u.unlocked,!u.requiresCode,u.online else{return};do{let data=try await u.request("/api/location");people=try JSONDecoder().decode(LocationSnapshot.self,from:data).people}catch{if !sharing{message="Connect to see our locations."}}}
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager){if requesting{switch manager.authorizationStatus{case .authorizedAlways,.authorizedWhenInUse:begin();case .denied,.restricted:requesting=false;message="Location permission was declined.";default:break}}else if sharing{resume()}}
    func locationManager(_ manager:CLLocationManager,didFailWithError error:Error){message="Waiting for a fresh location. Check signal and permission."}
    func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]){guard let location=locations.last,sharing,location.horizontalAccuracy>=0,abs(location.timestamp.timeIntervalSinceNow)<90 else{return};pending=location;sendPending()}
    private func sendPending(){guard !sending,sharing,let u=universe,let p=pending,Date().timeIntervalSince(lastSent)>=5 else{return};pending=nil;sending=true;lastSent=Date()
        Task{defer{sending=false};do{let data=try await u.request("/api/location",body:JSONSerialization.data(withJSONObject:["action":"update","actor":actor,"token":token,"position":["latitude":p.coordinate.latitude,"longitude":p.coordinate.longitude,"accuracy":p.horizontalAccuracy,"capturedAt":Int(p.timestamp.timeIntervalSince1970*1000)]]));people=try JSONDecoder().decode(LocationSnapshot.self,from:data).people;message="Sharing until you stop · background enabled"}catch let e as ServerError where e.status==409{clear();message=e.message}catch{message="Sharing paused · waiting for a connection"}}
    }
}
struct HomeLocationCard:View {
    @ObservedObject var model:LiveLocationModel
    @State private var expanded=false
    var body:some View{VStack(spacing:0){
        HStack{Label("Find each other",systemImage:"location.fill").font(.system(size:13,weight:.semibold));Spacer();Button(model.stopPending ? "Retry stop":model.sharing ? "Stop":"Share"){if model.sharing || model.stopPending{model.stop()}else{expanded=true}}.font(.system(size:12,weight:.semibold)).frame(minHeight:44).disabled(model.busy)}.padding(.horizontal,12)
        Button{expanded=true}label:{LocationMap(people:model.people).frame(height:96).overlay(alignment:.topTrailing){Image(systemName:"arrow.up.left.and.arrow.down.right").font(.caption).padding(7).background(.regularMaterial,in:Circle()).padding(6)}}.buttonStyle(.plain).accessibilityLabel("Open our location map")
        TimelineView(.periodic(from:.now,by:10)){context in HStack(spacing:10){ForEach(["asnat","youssef"],id:\.self){actor in let p=model.people.first{$0.actor==actor};Text((actor=="asnat" ? "A":"Y")+" · "+(p?.status(at:context.date) ?? "Not sharing")).font(.system(size:10)).lineLimit(1).frame(maxWidth:.infinity,alignment:.leading)}}}.padding(.horizontal,12).padding(.vertical,7)
    }.background(.white,in:RoundedRectangle(cornerRadius:18)).clipShape(RoundedRectangle(cornerRadius:18)).sheet(isPresented:$expanded){NavigationStack{VStack(spacing:16){LocationMap(people:model.people).frame(maxHeight:.infinity).clipShape(RoundedRectangle(cornerRadius:24));ForEach(model.people){p in HStack{Avatar(actor:p.actor,size:30);Text(p.name);Spacer();TimelineView(.periodic(from:.now,by:10)){c in Text(p.status(at:c.date)).font(.caption)}}};Text(model.message).font(.footnote).foregroundColor(Palette.muted);Text("Sharing stays enabled until you stop it. iPhone may pause updates when the app is force-closed, permission is removed, or connectivity is lost.").font(.caption).foregroundColor(Palette.muted);Button(model.stopPending ? "Retry stopping location":model.sharing ? "Stop sharing my location":"Share my location · until I stop"){if model.sharing || model.stopPending{model.stop()}else{model.start()}}.primary().disabled(model.busy)}.padding(16).background(Palette.background).navigationTitle("Where we are").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){expanded=false}}}}}
        .task{while !Task.isCancelled{await model.refresh();do{try await Task.sleep(nanoseconds:10_000_000_000)}catch{return}}}
    }
}
struct LocationMap:UIViewRepresentable {
    var people:[LocationPerson]
    func makeUIView(context:Context)->MKMapView{let map=MKMapView();map.isRotateEnabled=false;map.isPitchEnabled=false;map.showsUserLocation=false;map.pointOfInterestFilter = .excludingAll;return map}
    func updateUIView(_ map:MKMapView,context:Context){let pins=people.filter{$0.position != nil && Date().timeIntervalSince1970-($0.position!.capturedAt/1000)<300};let key=pins.map{"\($0.actor):\($0.position!.latitude):\($0.position!.longitude)"}.joined();guard key != context.coordinator.key else{return};context.coordinator.key=key;map.removeAnnotations(map.annotations);let annotations=pins.map{p->MKPointAnnotation in let a=MKPointAnnotation();a.coordinate=p.coordinate;a.title=p.name;return a};map.addAnnotations(annotations);if !annotations.isEmpty{map.showAnnotations(annotations,animated:false);if annotations.count==1{map.setRegion(MKCoordinateRegion(center:annotations[0].coordinate,latitudinalMeters:1800,longitudinalMeters:1800),animated:false)}}else{map.setRegion(MKCoordinateRegion(center:CLLocationCoordinate2D(latitude:25,longitude:0),span:MKCoordinateSpan(latitudeDelta:100,longitudeDelta:180)),animated:false)}}
    func makeCoordinator()->Coordinator{Coordinator()};final class Coordinator{var key="initial"}
}
