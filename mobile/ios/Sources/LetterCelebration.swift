import SwiftUI

struct LetterCelebration:View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @AppStorage("motion-paused") private var paused=false
    @State private var start=Date()
    @State private var finished=false
    var body:some View {
        Group {
            if !reduced && !paused && !finished {
                TimelineView(.animation(minimumInterval:1.0/30)){context in
                    GeometryReader{size in
                        let progress=min(1,max(0,context.date.timeIntervalSince(start)/2.8))
                        ForEach(0..<26,id:\.self){index in
                            Text(index%3==0 ? "♡":index%3==1 ? "✦":"▪")
                                .font(.system(size:index%3==0 ? 22:14,weight:.semibold))
                                .foregroundColor(index%2==0 ? Palette.purple:Color(red:0.48,green:0.65,blue:0.87))
                                .rotationEffect(.degrees(Double(index*27)+progress*160))
                                .position(x:size.size.width*CGFloat(Double((index*37)%100)/100)+CGFloat(sin(progress*5+Double(index))*18),y:-40+CGFloat(progress)*(size.size.height+80)+CGFloat((index*13)%90))
                                .opacity(max(0,1-progress*progress))
                        }
                    }
                }
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
            .task{start=Date();do{try await Task.sleep(nanoseconds:2_900_000_000)}catch{return};finished=true}
    }
}
