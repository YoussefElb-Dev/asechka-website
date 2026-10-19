import SwiftUI
import PhotosUI
import ImageIO

struct PostDraft:Codable {
    var text=""
    var note=""
    var date=Date()
    var photo:Data?
}
struct ComposerView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var request:ComposeRequest
    @State private var draft=PostDraft()
    @State private var photo=true
    @State private var selection:PhotosPickerItem?
    @State private var preparing=false
    @State private var committed=false
    @State private var restored=false
    @State private var failure:String?
    private var draftKey:String{"post-draft:"+universe.actor+":"+(request.post?.id ?? (request.photo ? "photo":"quote"))}
    var body:some View {
        NavigationStack{ScrollView{VStack(alignment:.leading,spacing:20){
            HStack(spacing:12){Avatar(actor:universe.actor,size:44);VStack(alignment:.leading,spacing:4){Text(universe.name).font(.headline);Text("Our little universe · just us two").font(.caption).foregroundColor(Palette.muted)}}
            if request.post==nil {Picker("Post type",selection:$photo){Text("Photo").tag(true);Text("Quote").tag(false)}.pickerStyle(.segmented)}
            if photo {
                Group{
                    if let bytes=draft.photo,let image=UIImage(data:bytes){Image(uiImage:image).resizable().scaledToFit()}
                    else if let post=request.post {CachedPhoto(source:post.imageURL,living:false)}
                    else {VStack(spacing:14){Image(systemName:"photo.badge.plus").font(.system(size:40,weight:.light));Text("A little moment worth keeping").font(.subheadline)}.foregroundColor(Palette.purple).frame(maxWidth:.infinity).padding(50).background(Palette.gradient)}
                }.frame(maxWidth:.infinity,minHeight:180,maxHeight:350).clipShape(RoundedRectangle(cornerRadius:22))
                PhotosPicker(selection:$selection,matching:.images,photoLibrary:.shared()){
                    Label(preparing ? "Preparing your picture…":draft.photo==nil ? "Choose a photo":"Choose a different photo",systemImage:"photo.on.rectangle").frame(maxWidth:.infinity).primary()
                }.disabled(preparing)
            } else {Text(draft.text.isEmpty ? "Your words, kept close. ♡":"“\(draft.text)”").font(.custom("Manrope-Regular",size:24)).lineSpacing(7).lineLimit(8).multilineTextAlignment(.center).padding(28).frame(maxWidth:.infinity,minHeight:210).background(Palette.gradient,in:RoundedRectangle(cornerRadius:22))}
            VStack(alignment:.leading,spacing:8){Text(photo ? "CAPTION":"YOUR WORDS").font(.system(size:10,weight:.bold)).tracking(2).foregroundColor(Palette.purple)
                TextEditor(text:$draft.text).frame(minHeight:120).scrollContentBackground(.hidden).padding(8).background(.white,in:RoundedRectangle(cornerRadius:16))
                Text("\(draft.text.count) / \(photo ? 1000:10000)").font(.caption).foregroundColor(Palette.muted)
            }
            if !photo {TextField("A little note · optional",text:$draft.note,axis:.vertical).lineLimit(2...5).padding(16).background(.white,in:RoundedRectangle(cornerRadius:16))}
            DatePicker("A day to remember",selection:$draft.date,displayedComponents:.date).font(.subheadline)
            Text("Saved on your phone first. Shared with both of us when connected.").font(.caption).foregroundColor(Palette.muted)
            if let failure {Text(failure).font(.subheadline).foregroundColor(.red)}
        }.padding(22)}.background(Palette.background)
            .navigationTitle(request.post==nil ? "New post":"Edit post").navigationBarTitleDisplayMode(.inline)
            .toolbar{
                ToolbarItem(placement:.cancellationAction){Button("Close"){persist();dismiss()}}
                ToolbarItem(placement:.confirmationAction){Button(request.post==nil ? "Share":"Save",action:save).fontWeight(.semibold).disabled(preparing || draft.text.count>(photo ? 1000:10000) || (!photo && draft.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty) || (photo && draft.photo==nil && request.post==nil))}
            }
        }
        .onAppear{guard !restored else{return};restored=true;photo=request.photo
            if let saved=universe.vault.value(draftKey,as:PostDraft.self){draft=saved}
            else if let post=request.post{draft.text=post.content;draft.note=post.note ?? "";draft.date=Self.day.date(from:post.date) ?? Date()}
        }
        .task(id:selection){guard let selection else{return};preparing=true;defer{preparing=false}
            do{guard let bytes=try await selection.loadTransferable(type:Data.self),bytes.count<=25_000_000 else{throw ServerError(message:"Choose a picture smaller than 25 MB.",status:400)}
                draft.photo=try await Task.detached(priority:.userInitiated){try Self.preparePhoto(bytes)}.value;persist();Touch.tap(true)
            }catch{failure=error.localizedDescription}
        }
        .task(id:draft.text+draft.note){do{try await Task.sleep(nanoseconds:700_000_000)}catch{return};persist()}
        .onDisappear{persist()}
    }
    static var day:DateFormatter{let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.dateFormat="yyyy-MM-dd";return f}
    private func persist(){guard restored,!committed else{return};do{try universe.vault.save(draftKey,draft)}catch{failure=error.localizedDescription}}
    private func save(){
        let operation=UUID().uuidString.lowercased()
        var body:[String:Any]=["action":(request.post==nil ? "add":"update")+(photo ? "Photo":"Quote"),"date":Self.day.string(from:draft.date),photo ? "caption":"text":draft.text.trimmingCharacters(in:.whitespacesAndNewlines),"note":draft.note,"author":universe.actor,"operationId":operation]
        if let post=request.post{body["id"]=post.id;body["expectedVersion"]=post.editVersion ?? ""}
        if photo,let bytes=draft.photo{body["photo"]="data:image/jpeg;base64,"+bytes.base64EncodedString()}
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
            HStack(alignment:.bottom,spacing:12){Avatar(actor:universe.actor,size:34);TextField("Leave a little love…",text:$text,axis:.vertical).lineLimit(1...5).padding(12).background(.white,in:RoundedRectangle(cornerRadius:18));Button(action:send){Image(systemName:"arrow.up").font(.system(size:18,weight:.semibold)).frame(width:44,height:44).foregroundColor(.white).background(Palette.purple,in:Circle())}.disabled(text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || text.count>1000)}.padding(16)
        }.background(Palette.background).navigationTitle("A little conversation").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}
            .presentationDetents([.large]).onAppear{text=universe.vault.value(key,as:String.self) ?? ""}
            .onDisappear{try? universe.vault.save(key,text)}
            .task(id:text){do{try await Task.sleep(nanoseconds:500_000_000)}catch{return};try? universe.vault.save(key,text)}
    }
    private func send(){do{try universe.comment(post,text.trimmingCharacters(in:.whitespacesAndNewlines));text="";try? universe.vault.save(key,"");Touch.tap(true)}catch{universe.error=error.localizedDescription}}
}
