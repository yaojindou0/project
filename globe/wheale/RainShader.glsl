uniform sampler2D colorTexture;//输入的场景渲染照片
in vec2 v_textureCoordinates;//v_textureCoordinates代表屏幕采样点坐标
uniform float u_scale;

float hash(float x){
    return fract(sin(x*133.3)*13.13); //返回x-floor(x)，即返回x的小数部分
}

void main(){
    float time = czm_frameNumber * u_scale / 1000.0;
    vec2 resolution = czm_viewport.zw;

    vec2 uv=(gl_FragCoord.xy*2.-resolution.xy)/min(resolution.x,resolution.y);
    vec3 c=vec3(.6,.7,.8);

    float a=-.4;
    float si=sin(a),co=cos(a);
    uv*=mat2(co,-si,si,co);
    uv*=length(uv+vec2(0,4.9))*.3+1.;

    float v=1.-sin(hash(floor(uv.x*100.))*2.);
    float b=clamp(abs(sin(20.*time*v+uv.y*(5./(2.+v))))-.95,0.,1.)*20.;
    c*=v*b; 

    out_FragColor = mix(texture(colorTexture, v_textureCoordinates), vec4(c,1), .5);  
}


//mix(x,y,a)  a控制混合结果 return x(1-a) +y*a  返回 线性混合的值

//clamp(a x y）  返回中间大小的值    例如   clamp(5 1 4) 返回的是4 。 -3 1 2返回1     
//第一个和第二个比 选出大的temp 然后temp和第三个比 选出小的

//floor(genType x):向下取整函数

//length (genType x) 返回向量x的长度


//mat2  2×2的浮点数矩阵类型

//depthTexture代表场景中的深度图
//v_textureCoordinates代表屏幕采样点坐标