import SwiftUI
import ImageIO

struct FeedView:View {
    @EnvironmentObject private var universe:UniverseStore
    var mode:Int
    @Binding var savedOnly:Bool
    var create:(Bool)->Void
    var corner:()->Void
    var navigate:(Int)->Void
    @State private var comments:PostSelection?
    @State private var viewer:PostSelection?
    @State private var edit:ComposeRequest?
    @State private var deletion:PostSelection?
    @State private var shortcut:BookRoute?
    private var home:Bool{mode==0 && !savedOnly}
    var posts:[Post]{universe.memories.posts.filter{(mode==0 || (mode==1 ? $0.isPhoto:!$0.isPhoto)) && (!savedOnly || universe.bookmarks.contains($0.key))}}
    var body:some View {
        ScrollViewReader{proxy in
            ScrollView{LazyVStack(spacing:12){
                header.id("top")
                if mode==2 && !savedOnly {QuoteCarousel().padding(.horizontal,18)}
                ForEach(posts){post in PostCard(post:post,comments:{comments=PostSelection(post:post)},open:{viewer=PostSelection(post:post)},edit:{edit=ComposeRequest(photo:post.isPhoto,post:post)},delete:{deletion=PostSelection(post:post)})}
                Text(posts.isEmpty ? "Our next favorite moment starts with you. ♡":"All caught up. More little moments soon. ♡").font(.footnote).foregroundColor(Palette.muted).padding(30)
            }.padding(.bottom,12)}
            .refreshable{await universe.refresh()}
        }
        .sheet(item:$comments){selection in CommentsView(post:selection.post)}
        .sheet(item:$shortcut){route in BookView(personal:route.personal,initialChapter:route.chapter)}
        .sheet(item:$edit){ComposerView(request:$0)}
        .fullScreenCover(item:$viewer){selection in PhotoViewer(post:selection.post)}
        .confirmationDialog("Delete this shared post?",isPresented:Binding(get:{deletion != nil},set:{if !$0{deletion=nil}}),titleVisibility:.visible){
            Button("Delete post",role:.destructive){guard let post=deletion?.post else{return};do{try universe.enqueue("/api/memories",["action":post.isPhoto ? "removePhoto":"removeQuote","id":post.id,"expectedVersion":post.editVersion ?? ""])}catch{universe.error=error.localizedDescription};deletion=nil}
        }message:{Text("This removes it from both phones and the website.")}
    }
    private var header:some View {
        VStack(alignment:.leading,spacing:home ? 8:19){
            if home {
                HStack(spacing:10){story("Create","plus"){create(true)};story("Our corner","heart",action:corner);story("Saved","bookmark"){savedOnly.toggle()}}.padding(.horizontal,16)
            }else {
                ScrollView(.horizontal,showsIndicators:false){HStack(spacing:18){
                    story("Create","plus"){create(mode != 2)};story("Our corner","heart",action:corner)
                    story("Our days","sparkles"){navigate(4)};story("Music","music.note"){navigate(3)}
                    story(savedOnly ? "All posts":"Saved","bookmark"){savedOnly.toggle()}
                }.padding(.horizontal,22)}
            }
            if mode==0 && !savedOnly {HomeHub{shortcut=$0}}
            if !home {VStack(alignment:.leading,spacing:6){
                Text(savedOnly ? "Kept close.":mode==1 ? "Our camera roll.":mode==2 ? "Words to keep.":"Our little us.").font(.custom("Manrope-Bold",size:28))
                Text("A little life together, one moment at a time.").font(.subheadline).foregroundColor(Palette.muted)
                Button{create(mode != 2)}label:{HStack(spacing:12){Avatar(actor:universe.actor);Text("Something to share, \(universe.name)?").font(.subheadline).foregroundColor(Palette.muted);Spacer();Image(systemName:"plus")}.padding(14).background(.white,in:RoundedRectangle(cornerRadius:22))}.padding(.top,10)
            }.padding(.horizontal,22)}
        }.padding(.top,home ? 4:12).padding(.bottom,home ? 0:8)
    }
    private func story(_ text:String,_ symbol:String,action:@escaping()->Void)->some View {
        Button{Touch.tap();action()}label:{
            if home{Label(text,systemImage:symbol).font(.system(size:13,weight:.medium)).padding(.horizontal,6).frame(maxWidth:.infinity,minHeight:44).background(Palette.lavender,in:Capsule())}
            else{VStack(spacing:8){Image(systemName:symbol).font(.system(size:25,weight:.light)).frame(width:62,height:62).background(Palette.gradient,in:Circle()).overlay(Circle().stroke(Palette.purple.opacity(0.25),lineWidth:2));Text(text).font(.system(size:11))}.frame(width:70)}
        }
    }
}
struct CachedPhoto:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.accessibilityReduceMotion) private var reduced
    @AppStorage("motion-paused") private var paused=false
    let source:String
    var living=true
    @State private var bitmap:UIImage?
    @State private var loading=true
    @State private var drift=false
    var body:some View {
        ZStack{
            Palette.blue
            if let bitmap {Image(uiImage:bitmap).resizable().scaledToFit().scaleEffect(drift && living && !reduced && !paused ? 1.025:1).transition(.opacity)}
            else if loading {ProgressView().tint(Palette.purple)}
            else {VStack(spacing:10){Image(systemName:"photo").font(.title);Text("Connect to finish saving this picture").font(.caption).multilineTextAlignment(.center)}.foregroundColor(Palette.muted).padding()}
        }.clipped()
        .task(id:source){bitmap=nil;loading=true;if let data=await universe.image(source){
            let image=await Task.detached(priority:.userInitiated){Self.thumbnail(data)}.value
            withAnimation(reduced ? nil:.easeIn(duration:0.3)){bitmap=image}
        };loading=false}
        .onAppear{if !reduced && !paused{withAnimation(.easeInOut(duration:8).repeatForever(autoreverses:true)){drift=true}}}
        .onDisappear{drift=false}
        .accessibilityElement(children:.ignore).accessibilityLabel("Our shared photo").accessibilityValue(bitmap == nil ? "Loading image":"Saved image")
    }
    static func thumbnail(_ data:Data)->UIImage?{
        guard let source=CGImageSourceCreateWithData(data as CFData,nil),let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:1600,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary)else{return nil};return UIImage(cgImage:image)
    }
}
struct PostCard:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.accessibilityReduceMotion) private var reduced
    var post:Post
    var comments:()->Void
    var open:()->Void
    var edit:()->Void
    var delete:()->Void
    @State private var burst=false
    @State private var expanded=false
    var liked:Bool{post.social?.likes[universe.actor] ?? false}
    var body:some View {
        VStack(alignment:.leading,spacing:0){
            HStack(spacing:11){Avatar(actor:post.author ?? "us");VStack(alignment:.leading,spacing:3){Text(post.name).font(.system(size:14,weight:.semibold));Text((post.isPhoto ? "A moment":"A thought")+(post.date.isEmpty ? "":" · "+post.date)+(post.pending==true ? " · saved offline":"")).font(.system(size:11)).foregroundColor(Palette.muted)};Spacer()
                Menu{Button("Edit post",systemImage:"pencil",action:edit);Button(universe.bookmarks.contains(post.key) ? "Remove from saved":"Save post",systemImage:"bookmark"){universe.bookmark(post)};Button("Delete post",systemImage:"trash",role:.destructive,action:delete)}label:{Image(systemName:"ellipsis").frame(width:44,height:44)}.accessibilityLabel("Post options")
            }.padding(.leading,18).padding(.trailing,8).padding(.vertical,10)
            ZStack{
                if post.isPhoto {CachedPhoto(source:post.imageURL).aspectRatio(0.86,contentMode:.fit)}
                else {Text("“\(post.text ?? "")”").font(.custom("Manrope-Regular",size:(post.text?.count ?? 0)>300 ? 21:25)).lineSpacing(8).lineLimit(expanded ? nil:9).multilineTextAlignment(.center).frame(maxWidth:.infinity,minHeight:230,alignment:.top).padding(30).background(Palette.gradient)}
                if burst {Image(systemName:"heart.fill").font(.system(size:84)).foregroundColor(.white).shadow(color:Palette.purple.opacity(0.3),radius:15).scaleEffect(burst ? 1:0.1).transition(.scale.combined(with:.opacity))}
            }.contentShape(Rectangle()).accessibilityElement(children:.contain).accessibilityIdentifier("Post media")
                .onTapGesture(count:2){Touch.tap(true);universe.like(post,true);withAnimation(reduced ? nil:.spring(response:0.3,dampingFraction:0.6)){burst=true};Task{try? await Task.sleep(nanoseconds:850_000_000);withAnimation{burst=false}}}
                .onTapGesture{open()}
            HStack(spacing:6){
                Button{Touch.tap();withAnimation(.spring(response:0.3,dampingFraction:0.5)){universe.like(post,!liked)}}label:{Image(systemName:liked ? "heart.fill":"heart").foregroundColor(liked ? Palette.purple:Palette.ink).scaleEffect(liked ? 1.08:1).frame(width:44,height:48)}.accessibilityLabel(liked ? "Unlike post":"Like post")
                Button(action:comments){Image(systemName:"bubble.right").frame(width:44,height:48)}.accessibilityLabel("Comments")
                ShareLink(item:post.content+"\n\nOur little universe ♡\n"+UniverseStore.site){Image(systemName:"paperplane").frame(width:44,height:48)}
                Spacer();Button{Touch.tap();universe.bookmark(post)}label:{Image(systemName:universe.bookmarks.contains(post.key) ? "bookmark.fill":"bookmark").frame(width:44,height:48)}.accessibilityLabel("Save post")
            }.font(.system(size:22,weight:.light)).padding(.horizontal,10)
            VStack(alignment:.leading,spacing:9){
                Text(likeText).font(.system(size:12,weight:.semibold))
                if let caption=post.isPhoto ? post.caption:post.note,!caption.isEmpty {Text(caption).font(.system(size:14)).lineLimit(expanded ? nil:3).onTapGesture{withAnimation{expanded.toggle()}}}
                if !post.isPhoto && (post.text?.count ?? 0)>260 {Button(expanded ? "Keep it little":"Read the whole quote"){withAnimation{expanded.toggle()}}.font(.caption)}
                Button(action:comments){Text(post.social?.comments.isEmpty==false ? "View all \(post.social?.comments.count ?? 0) comments":"Start our conversation").font(.system(size:13)).foregroundColor(Palette.muted)}
                if let last=post.social?.comments.last {Text("\(Post.name(last.author))  ").fontWeight(.semibold)+Text(last.text).font(.system(size:13))}
                Button(action:comments){HStack(spacing:9){Avatar(actor:universe.actor,size:25);Text("Leave a little love…").font(.system(size:12)).foregroundColor(Palette.muted);Spacer();Text("♡").foregroundColor(Palette.purple)}}.padding(.top,3)
            }.padding(.horizontal,20).padding(.bottom,20)
        }.background(.white)
    }
    private var likeText:String {
        let a=post.social?.likes["asnat"]==true,y=post.social?.likes["youssef"]==true
        return a && y ? "Liked by you both ♡":a ? "Liked by Asnat ♡":y ? "Liked by Youssef ♡":"A little love goes a long way"
    }
}
struct QuoteCarousel:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.accessibilityReduceMotion) private var reduced
    @AppStorage("motion-paused") private var motionPaused=false
    @State private var index=0
    @State private var paused=false
    var body:some View {
        VStack(alignment:.leading,spacing:18){Text("WORDS I WANT US TO KEEP").font(.system(size:10,weight:.bold)).tracking(2).foregroundColor(Palette.purple)
            if !universe.memories.quotes.isEmpty {
                let quote=universe.memories.quotes[index % universe.memories.quotes.count]
                Text("“\(quote.text ?? "")”").font(.custom("Manrope-Regular",size:22)).lineSpacing(6).frame(maxWidth:.infinity,minHeight:150).id(quote.id).transition(.opacity.combined(with:.move(edge:.trailing)))
                HStack{Button{move(-1)}label:{Image(systemName:"arrow.left").frame(width:48,height:44)};Spacer();Button(paused ? "Resume":"Pause"){paused.toggle()}.font(.caption);Spacer();Button{move(1)}label:{Image(systemName:"arrow.right").frame(width:48,height:44)}}
                Text("\(index % universe.memories.quotes.count+1) / \(universe.memories.quotes.count)").font(.caption).foregroundColor(Palette.muted)
            }
        }.padding(22).background(Palette.gradient,in:RoundedRectangle(cornerRadius:24)).clipped()
        .gesture(DragGesture(minimumDistance:45).onEnded{move($0.translation.width<0 ? 1:-1)})
        .task{while !Task.isCancelled{do{try await Task.sleep(nanoseconds:8_000_000_000)}catch{return};if !paused && !reduced && !motionPaused{move(1)}}}
    }
    private func move(_ delta:Int){let count=universe.memories.quotes.count;guard count>0 else{return};withAnimation(reduced ? nil:.easeInOut(duration:0.45)){index=(index+delta+count)%count}}
}
struct PhotoViewer:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var post:Post
    @State private var selected:String?
    @State private var scale:CGFloat=1
    @State private var lastScale:CGFloat=1
    @State private var offset=CGSize.zero
    @State private var savedOffset=CGSize.zero
    private var current:Post{universe.memories.posts.first{$0.key==(selected ?? post.key)} ?? post}
    var body:some View {
        ZStack{Color.black.ignoresSafeArea()
            if current.isPhoto {CachedPhoto(source:current.imageURL,living:false).scaledToFit().scaleEffect(scale).offset(offset).gesture(MagnificationGesture().onChanged{scale=min(5,max(1,lastScale*$0))}.onEnded{_ in lastScale=scale;if scale==1{offset = .zero;savedOffset = .zero}}).simultaneousGesture(DragGesture().onChanged{if scale>1{offset=CGSize(width:savedOffset.width+$0.translation.width,height:savedOffset.height+$0.translation.height)}}.onEnded{value in if scale==1 && abs(value.translation.width)>55{move(value.translation.width<0 ? 1:-1)}else{savedOffset=offset}}).onTapGesture(count:2){withAnimation{scale=scale>1 ? 1:2.5;lastScale=scale;offset = .zero;savedOffset = .zero}}}
            else {ScrollView{Text(current.text ?? "").font(.custom("Manrope-Regular",size:26)).lineSpacing(10).padding(32).foregroundColor(.white)}}
            VStack{HStack{Spacer();Button{dismiss()}label:{Image(systemName:"xmark").font(.title3).padding(15).background(.ultraThinMaterial,in:Circle())}.accessibilityLabel("Close photo").padding()};Spacer();Text(current.content).font(.caption).foregroundColor(.white).padding(20)
                if current.isPhoto {HStack{Button{move(-1)}label:{Image(systemName:"chevron.left").frame(width:60,height:48)}.accessibilityLabel("Previous photo");Spacer();Button{move(1)}label:{Image(systemName:"chevron.right").frame(width:60,height:48)}.accessibilityLabel("Next photo")}.foregroundColor(.white).padding(.horizontal,20)}
            }
        }
    }
    private func move(_ delta:Int){let photos=universe.memories.photos;guard let index=photos.firstIndex(where:{$0.id==current.id}),!photos.isEmpty else{return};Touch.tap();scale=1;lastScale=1;offset = .zero;savedOffset = .zero;withAnimation(.easeInOut(duration:0.25)){selected=photos[(index+delta+photos.count)%photos.count].key}}
}
