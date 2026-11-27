import SwiftUI
import PhotosUI
import ImageIO

struct PostDraft:Codable {
    var text=""
    var note=""
    var date=Date()
    var photo:Data?
    var collection:PhotoCollection?
    var photoType:Bool?
}
struct ComposerView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduced
    @Namespace private var segmentMotion
    var request:ComposeRequest
    @State private var draft=PostDraft()
    @State private var photo=true
    @State private var selection:PhotosPickerItem?
    @State private var preparing=false
    @State private var committed=false
    @State private var restored=false
    @State private var failure:String?
    private var draftKey: String {
        let kind = request.photo ? (request.collection == .photography ? "photo:photography" : "photo") : "quote"
        return "post-draft:\(universe.actor):\(request.post?.id ?? kind)"
    }
    private var collectionBinding:Binding<PhotoCollection>{Binding(get:{draft.collection ?? request.post?.photoCollection ?? request.collection},set:{draft.collection=$0;persist()})}
    private var authorCard:some View {
        HStack(spacing:12){
            Avatar(actor:universe.actor,size:42)
            VStack(alignment:.leading,spacing:2){
                Text(universe.name).font(.system(size:15,weight:.bold)).foregroundColor(Palette.ink)
                Text("Our little universe · private to us").font(.system(size:12)).foregroundColor(Palette.muted)
            }
            Spacer()
            Text(photo ? "Photo" : "Quote")
                .font(.system(size:11,weight:.bold))
                .foregroundColor(Palette.violet)
                .padding(.horizontal,11).padding(.vertical,5)
                .background(Palette.lavender,in:Capsule())
        }
        .padding(14)
        .background(.white,in:RoundedRectangle(cornerRadius:20,style:.continuous))
        .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Palette.lavender,lineWidth:1))
    }
    private var typeSwitcher:some View {
        HStack(spacing:4){
            ForEach([(true,"Photo","photo.on.rectangle"),(false,"Quote","quote.opening")],id:\.0){item in
                let active = photo == item.0
                Button{Touch.tap();if reduced{photo=item.0}else{withAnimation(.spring(response:0.28,dampingFraction:0.80)){photo=item.0}}}label:{
                    ZStack{
                        if active {
                            Capsule()
                                .fill(Color.white)
                                .shadow(color:Palette.purple.opacity(0.10),radius:3,x:0,y:1)
                                .matchedGeometryEffect(id:"composer-type",in:segmentMotion)
                        }
                        Label(item.1,systemImage:item.2)
                            .font(.system(size:13,weight:.semibold))
                            .foregroundColor(active ? Palette.violet : Palette.muted)
                    }
                    .frame(maxWidth:.infinity).frame(height:38)
                    .contentShape(Capsule())
                }.buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Palette.lavender,in:Capsule())
    }
    private var collectionSwitcher:some View {
        HStack(spacing:4){
            ForEach(PhotoCollection.allCases){item in
                let active = collectionBinding.wrappedValue == item
                Button{Touch.tap();if reduced{collectionBinding.wrappedValue=item}else{withAnimation(.spring(response:0.28,dampingFraction:0.80)){collectionBinding.wrappedValue=item}}}label:{
                    ZStack{
                        if active {
                            Capsule()
                                .fill(Color.white)
                                .shadow(color:Palette.purple.opacity(0.10),radius:3,x:0,y:1)
                                .matchedGeometryEffect(id:"composer-collection",in:segmentMotion)
                        }
                        Text(item.title)
                            .font(.system(size:13,weight:.semibold))
                            .foregroundColor(active ? Palette.violet : Palette.muted)
                    }
                    .frame(maxWidth:.infinity).frame(height:36)
                    .contentShape(Capsule())
                }.buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Palette.lavender,in:Capsule())
        .accessibilityIdentifier("composer.photo.collection")
    }
    private var mediaCard:some View {
        VStack(spacing:12){
            if photo {
                collectionSwitcher
                PhotosPicker(selection:$selection,matching:.images,photoLibrary:.shared()){
                    ZStack(alignment:.bottom){
                        Group{
                            if let bytes=draft.photo,let image=UIImage(data:bytes){Image(uiImage:image).resizable().scaledToFill()}
                            else if let post=request.post {CachedPhoto(source:post.imageURL,living:false)}
                            else {
                                VStack(spacing:12){
                                    Image(systemName:"photo.badge.plus")
                                        .font(.system(size:26,weight:.semibold))
                                        .foregroundColor(Palette.violet)
                                        .frame(width:58,height:58)
                                        .background(.white,in:Circle())
                                        .shadow(color:Palette.purple.opacity(0.14),radius:8,y:3)
                                    Text("Tap to choose a photo").font(.system(size:15,weight:.semibold)).foregroundColor(Palette.ink)
                                    Text("A moment worth keeping close").font(.system(size:12)).foregroundColor(Palette.muted)
                                }
                                .frame(maxWidth:.infinity,minHeight:220)
                                .background(Palette.gradient)
                            }
                        }
                        .frame(maxWidth:.infinity,minHeight:220,maxHeight:300)
                        .clipShape(RoundedRectangle(cornerRadius:24,style:.continuous))
                        .overlay(RoundedRectangle(cornerRadius:24,style:.continuous).stroke(Palette.purple.opacity(0.14),lineWidth:1))
                        if draft.photo != nil || request.post != nil {
                            Label(preparing ? "Preparing…" : "Change photo",systemImage:"photo.on.rectangle")
                                .font(.system(size:12,weight:.semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal,14).padding(.vertical,7)
                                .background(Color.black.opacity(0.55),in:Capsule())
                                .padding(.bottom,12)
                        }
                    }
                }.buttonStyle(.plain).disabled(preparing)
                PhotosPicker(selection:$selection,matching:.images,photoLibrary:.shared()){
                    Label(preparing ? "Preparing your picture…":draft.photo==nil ? "Choose a photo":"Choose a different photo",systemImage:"photo.on.rectangle")
                        .font(.system(size:14,weight:.semibold))
                        .foregroundColor(Palette.violet)
                        .frame(maxWidth:.infinity).frame(height:44)
                        .background(.white,in:Capsule())
                        .overlay(Capsule().stroke(Palette.lavender,lineWidth:1.2))
                }.disabled(preparing)
            } else {
                Text(draft.text.isEmpty ? "Your words, kept close. ♡":"“\(draft.text)”")
                    .font(.custom("Manrope-Regular",size:23)).lineSpacing(7).lineLimit(8)
                    .multilineTextAlignment(.center).padding(26)
                    .frame(maxWidth:.infinity,minHeight:190)
                    .background(Palette.gradient,in:RoundedRectangle(cornerRadius:24,style:.continuous))
                    .overlay(RoundedRectangle(cornerRadius:24,style:.continuous).stroke(Palette.purple.opacity(0.14),lineWidth:1))
            }
        }
    }
    var body:some View {
        NavigationStack{ScrollView{VStack(alignment:.leading,spacing:14){
            authorCard
            if request.post==nil {typeSwitcher}
            mediaCard
            VStack(alignment:.leading,spacing:12){
                HStack{
                    Text(photo ? "CAPTION":"YOUR WORDS").font(.system(size:10,weight:.bold)).tracking(2).foregroundColor(Palette.purple)
                    Spacer()
                    Text("\(draft.text.count) / \(photo ? 1000:10000)").font(.caption).foregroundColor(Palette.muted)
                }
                TextEditor(text:$draft.text)
                    .frame(minHeight:110)
                    .scrollContentBackground(.hidden)
                    .padding(10)
                    .background(Palette.background,in:RoundedRectangle(cornerRadius:16,style:.continuous))
                    .overlay(RoundedRectangle(cornerRadius:16,style:.continuous).stroke(Palette.lavender,lineWidth:1))
                    .accessibilityLabel(photo ? "Post caption":"Quote text")
                if !photo {
                    Text("LITTLE NOTE").font(.system(size:10,weight:.bold)).tracking(2).foregroundColor(Palette.purple).padding(.top,2)
                    TextField("A little note · optional",text:$draft.note,axis:.vertical)
                        .lineLimit(2...5).padding(12)
                        .background(Palette.background,in:RoundedRectangle(cornerRadius:16,style:.continuous))
                        .overlay(RoundedRectangle(cornerRadius:16,style:.continuous).stroke(Palette.lavender,lineWidth:1))
                }
                DatePicker("A day to remember",selection:$draft.date,displayedComponents:.date)
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal,14).padding(.vertical,10)
                    .background(Palette.background,in:RoundedRectangle(cornerRadius:16,style:.continuous))
            }
            .padding(16)
            .background(.white,in:RoundedRectangle(cornerRadius:22,style:.continuous))
            .overlay(RoundedRectangle(cornerRadius:22,style:.continuous).stroke(Palette.lavender,lineWidth:1))
            Text("Saved on your phone first. Shared with both of us when connected.").font(.caption).foregroundColor(Palette.muted).padding(.horizontal,4)
            if let failure {Text(failure).font(.subheadline).foregroundColor(.red)}
        }.padding(18)}.background(Palette.background)
            .navigationTitle(request.post==nil ? (photo ? "New photo":"New quote"):"Edit post").navigationBarTitleDisplayMode(.inline)
            .toolbar{
                ToolbarItem(placement:.cancellationAction){Button("Close"){persist();dismiss()}}
                ToolbarItem(placement:.confirmationAction){Button(request.post==nil ? "Share":"Save",action:save).fontWeight(.semibold).disabled(preparing || draft.text.count>(photo ? 1000:10000) || (!photo && draft.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty) || (photo && draft.photo==nil && request.post==nil))}
            }
        }
        .onAppear{guard !restored else{return};restored=true;photo=request.photo
            if let saved=universe.vault.value(draftKey,as:PostDraft.self){draft=saved;photo=saved.photoType ?? request.photo}
            else if let post=request.post{draft.text=post.content;draft.note=post.note ?? "";draft.date=Self.day.date(from:post.date) ?? Date()}
            if draft.collection==nil{draft.collection=request.post?.photoCollection ?? request.collection}
        }
        .task(id:selection){guard let selection else{return};preparing=true;defer{preparing=false}
            do{guard let bytes=try await selection.loadTransferable(type:Data.self),bytes.count<=25_000_000 else{throw ServerError(message:"Choose a picture smaller than 25 MB.",status:400)}
                draft.photo=try await Task.detached(priority:.userInitiated){try Self.preparePhoto(bytes)}.value;persist();Touch.tap(true)
            }catch{failure=error.localizedDescription}
        }
        .task(id:draft.text+draft.note){do{try await Task.sleep(nanoseconds:700_000_000)}catch{return};persist()}
        .onChange(of:photo){draft.photoType=$0;persist()}
        .onChange(of:draft.date){_ in persist()}
        .onDisappear{persist()}
    }
    static var day:DateFormatter{let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.dateFormat="yyyy-MM-dd";return f}
    private func persist(){guard restored,!committed else{return};do{try universe.vault.save(draftKey,draft)}catch{failure=error.localizedDescription}}
    private func save(){
        let operation=UUID().uuidString.lowercased()
        var body:[String:Any]=["action":(request.post==nil ? "add":"update")+(photo ? "Photo":"Quote"),"date":Self.day.string(from:draft.date),photo ? "caption":"text":draft.text.trimmingCharacters(in:.whitespacesAndNewlines),"note":draft.note,"author":universe.actor,"operationId":operation]
        if let post=request.post{body["id"]=post.id;body["expectedVersion"]=post.editVersion ?? ""}
        if photo,let bytes=draft.photo{body["photo"]="data:image/jpeg;base64,"+bytes.base64EncodedString()}
        if photo{body["collection"]=(draft.collection ?? request.post?.photoCollection ?? request.collection).rawValue}
        do{try universe.enqueue("/api/memories",body);committed=true;universe.vault.remove(draftKey);Touch.tap(true);dismiss()}
        catch{failure=error.localizedDescription}
    }
    static func preparePhoto(_ data:Data)throws->Data {
        guard let source=CGImageSourceCreateWithData(data as CFData,nil),let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:1600,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary)else{throw ServerError(message:"This picture couldn’t be read. Try another photo.",status:400)}
        var bitmap=UIImage(cgImage:image)
        for _ in 0..<6 {
            let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
            bitmap=UIGraphicsImageRenderer(size:bitmap.size,format:format).image{ctx in UIColor.white.setFill();ctx.fill(CGRect(origin:.zero,size:bitmap.size));bitmap.draw(in:CGRect(origin:.zero,size:bitmap.size))}
            for quality in [0.88,0.75,0.6,0.45] {if let result=bitmap.jpegData(compressionQuality:quality),result.count<=310_000{return result}}
            let size=CGSize(width:bitmap.size.width*0.75,height:bitmap.size.height*0.75)
            bitmap=UIGraphicsImageRenderer(size:size,format:format).image{_ in bitmap.draw(in:CGRect(origin:.zero,size:size))}
        }
        throw ServerError(message:"This picture needs a smaller copy. Try another photo.",status:400)
    }
}
struct CommentsView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    let post:Post
    @State private var text=""
    private var key:String{"comment-draft:"+universe.actor+":"+post.key}
    private var rows:[Comment]{universe.current(post).social?.comments ?? []}
    var body:some View {
        NavigationStack{VStack(spacing:0){
            ScrollViewReader{proxy in ScrollView{LazyVStack(alignment:.leading,spacing:16){
                if rows.isEmpty {Text("Be the first to leave a little love. ♡").foregroundColor(Palette.muted).padding(.vertical,40)}
                ForEach(rows){comment in HStack(alignment:.top,spacing:12){Avatar(actor:comment.author,size:34);VStack(alignment:.leading,spacing:7){Text(Post.name(comment.author)).font(.system(size:13,weight:.semibold));Text(comment.text).font(.system(size:15));Text(String(comment.createdAt.prefix(10))).font(.caption2).foregroundColor(Palette.muted)};Spacer()}.card().id(comment.id).contextMenu{
                    if comment.author==universe.actor{Button("Remove comment",role:.destructive){do{try universe.enqueue("/api/memories",["action":"removeComment","kind":post.kind,"id":post.id,"actor":universe.actor,"commentId":comment.id])}catch{universe.error=error.localizedDescription}}}
                }}
            }.padding(20)}.onChange(of:rows.count){_ in if let last=rows.last{withAnimation{proxy.scrollTo(last.id,anchor:.bottom)}}}}
            HStack(alignment:.bottom,spacing:12){Avatar(actor:universe.actor,size:34);TextField("Leave a little love…",text:$text,axis:.vertical).lineLimit(1...5).padding(12).background(.white,in:RoundedRectangle(cornerRadius:18));Button(action:send){Image(systemName:"arrow.up").font(.system(size:18,weight:.semibold)).frame(width:44,height:44).foregroundColor(.white).background(Palette.purple,in:Circle())}.accessibilityLabel("Send comment").disabled(text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || text.count>1000)}.padding(16)
        }.background(Palette.background).navigationTitle("A little conversation").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}
            .presentationDetents([.large]).onAppear{text=universe.vault.value(key,as:String.self) ?? ""}
            .onDisappear{try? universe.vault.save(key,text)}
            .task(id:text){do{try await Task.sleep(nanoseconds:500_000_000)}catch{return};try? universe.vault.save(key,text)}
    }
    private func send(){do{try universe.comment(post,text.trimmingCharacters(in:.whitespacesAndNewlines));text="";try? universe.vault.save(key,"");Touch.tap(true)}catch{universe.error=error.localizedDescription}}
}
