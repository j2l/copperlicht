//+ Nikolaus Gebhardt
// This file is part of the CopperLicht library, copyright by Nikolaus Gebhardt
// This file is part of the CopperLicht engine, (c) by N.Gebhardt

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Renderer
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * 3D renderer, interface for drawing 3d geometry.
 * @constructor
 * @class 3D renderer, interface for drawing 3d geometry. You can access this using {@link CopperLicht}.getRenderer().
 * @public
 */
CL3D.Renderer = function()
{
	this.canvas = null;
	this.gl = null;
	this.width = 0;
	this.height = 0;
	this.textureWasLoadedFlag = false;
	
	this.Projection = new CL3D.Matrix4();
	this.View = new CL3D.Matrix4();
	this.World = new CL3D.Matrix4();
	
	this.AmbientLight = new CL3D.ColorF();
	this.AmbientLight.R = 0.0;
	this.AmbientLight.G = 0.0;
	this.AmbientLight.B = 0.0;
	
	this.programStandardMaterial = null;
	this.programLightmapMaterial = null;
	
	this.MaterialPrograms = new Array();
	this.MaterialProgramsWithLight = new Array();
	this.MinExternalMaterialTypeId = 30;
	
	this.Program2DDrawingColorOnly = null;
	this.Program2DDrawingTextureOnly = null;
	this.Program2DDrawingCanvasFontColor = null;
	
	this.OnChangeMaterial = null;
	
	this.StaticBillboardMeshBuffer = null;
	
	this.Lights = new Array();
	this.DirectionalLight = null;
	
	// webgl specific
	this.currentGLProgram = null;
	
	this.domainTextureLoadErrorPrinted = false;
	
	this.printShaderErrors = true;
};

/**
 * Event handler called after the renderer switches to a specific material, useful for shader programming. 
 * You can use this to set the variables and uniforms in a custom shader by using this callback.
 * The first parameter of the function is the material type id, which gets returned for example by createMaterialType().
 * @example
 * var engine = startCopperLichtFromFile('3darea', 'test.ccbjs');
 *
 * // [...] create a shader and material here using for example
 * // var newMaterialType = engine.getRenderer().
 * //    createMaterialType(vertex_shader_source, fragment_shader_source);
 *	
 * // register callback function to set a variable in the new shader:
 * engine.getRenderer().OnChangeMaterial = function(mattype) 
 * {
 *   var renderer = engine.getRenderer();
 *   if (renderer && mattype == newMaterialType)
 *   {
 *      var gl = renderer.getWebGL();
 *
 *      // get variable location
 *      var program = renderer.getGLProgramFromMaterialType(newMaterialType);
 *      var variableLocation = gl.getUniformLocation(program, "test");
 *
 *      // set the content of the variable
 *      gl.uniform1f(location, 1.23);
 *   }
 * };
 * @public
 */
CL3D.Renderer.prototype.OnChangeMaterial = null;

/** 
 * Returns the current width of the rendering surface in pixels.
 * @public
 **/
CL3D.Renderer.prototype.getWidth = function()
{
	return this.width;
}


/**
 * @private
 */
CL3D.Renderer.prototype.getAndResetTextureWasLoadedFlag = function()
{
	var b = this.textureWasLoadedFlag;
	this.textureWasLoadedFlag = false;
	return b;
}

/**
 * Returns access to the webgl interface. This should not be needed.
 * @public
 **/
CL3D.Renderer.prototype.getWebGL = function()
{
	return this.gl;
}


/** 
 * Returns the current height of the rendering surface in pixels.
 * @public
 **/
CL3D.Renderer.prototype.getHeight = function()
{
	return this.height;
}


/**
 * @private
 */
CL3D.Renderer.prototype.registerFrame = function()
{
	// TODO: fps counter here
}


/**
 * Draws a {@link Mesh} with the current world, view and projection matrix.
 * @public
 * @param {CL3D.Mesh} mesh the mesh to draw
 */
CL3D.Renderer.prototype.drawMesh = function(mesh)
{
	if (mesh == null)
		return;
		
	for (var i=0; i<mesh.MeshBuffers.length; ++i)
	{
		var buf = mesh.MeshBuffers[i];	
		this.setMaterial(buf.Mat);		
		this.drawMeshBuffer(buf);
	}
}

/**
 * Sets a material to activate for drawing 3d graphics.
 * All 3d drawing functions will draw geometry using this material thereafter.
 * @param {CL3D.Material} mat Material to set
 * @public
 */
CL3D.Renderer.prototype.setMaterial = function(mat)
{
	if (mat == null)
	{
		return;
	}
	
	var gl = this.gl;
	if (gl == null)
		return;
	
	// --------------------------------------------
	// set material


	var program = null;
	try
	{
		if (mat.Lighting)
			program = this.MaterialProgramsWithLight[mat.Type];
		else
			program = this.MaterialPrograms[mat.Type];
	}
	catch(e) 
	{
	}
	
	if (program == null)
		return;

	this.currentGLProgram = program;
	gl.useProgram(program);
	
	// call callback function
	if (this.OnChangeMaterial != null)
	{
		try
		{			
			this.OnChangeMaterial(mat.Type);
		}
		catch(e) {}
	}
	
	// set program blend mode
	
	if (program.blendenabled)
	{
		gl.enable(gl.BLEND);
		gl.blendFunc(program.blendsfactor, program.blenddfactor);
	}
	else
		gl.disable(gl.BLEND);
	
	// zwrite mode
		
	if (!mat.ZWriteEnabled || mat.doesNotUseDepthMap())
		gl.depthMask(false);
	else
		gl.depthMask(true);
		
	// zread mode
	
	if (mat.ZReadEnabled)
		gl.enable(gl.DEPTH_TEST);
	else
		gl.disable(gl.DEPTH_TEST);
		
	// backface culling
	
	if (mat.BackfaceCulling)
		gl.enable(gl.CULL_FACE);
	else
		gl.disable(gl.CULL_FACE);
	//gl.cullFace(gl.BACK);
	
	
	// -------------------------------------------
	// set textures
	
	// texture 1
	
	if (mat.Tex1 && mat.Tex1.Loaded)
	{
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, mat.Tex1.Texture);
		
		// texture clamping
		
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mat.ClampTexture1 ? gl.CLAMP_TO_EDGE : gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mat.ClampTexture1 ? gl.CLAMP_TO_EDGE : gl.REPEAT);
	}
	else
	{
		// not yet loaded or inactive
	
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	
	gl.uniform1i(gl.getUniformLocation(program, "texture1"), 0);
	
	// texture 2
	
	if (mat.Tex2 && mat.Tex2.Loaded)
	{
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, mat.Tex2.Texture);
	}
	else
	{
		// not yet loaded or inactive
	
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	
	gl.uniform1i(gl.getUniformLocation(program, "texture2"), 1);
}


/**
 * Draws a mesh buffer.
 * Note, you might want to set the material of the mesh buffer before drawing it, use {@link setMaterial}() 
 * to do this before calling this function.
 * @param {CL3D.MeshBuffer} buf the mesh buffer to draw.
 * @public
 */
CL3D.Renderer.prototype.drawMeshBuffer = function(buf, indexCountToUse)
{
	if (buf == null)
		return;
		
	if (this.gl == null)
		return;
		
	if (buf.RendererNativeArray == null)
		this.createRendererNativeArray(buf)
	else
	if (buf.OnlyUpdateBufferIfPossible)
		this.updateRendererNativeArray(buf);
	else
	if (buf.OnlyPositionsChanged)
		this.updatePositionsInRendererNativeArray(buf);
		
	buf.OnlyPositionsChanged = false;
	buf.OnlyUpdateBufferIfPossible = false;
		
	this.drawWebGlStaticGeometry(buf.RendererNativeArray, indexCountToUse);
}

/**
 * Creates a mesh buffer native render array
 * @private
 */
CL3D.Renderer.prototype.updateRendererNativeArray = function(buf)
{
	if (buf.Vertices.length == 0 ||  buf.Indices.length == 0)
		return;
		
	if (buf.RendererNativeArray.vertexCount < buf.Vertices.length ||
	    buf.RendererNativeArray.indexCount < buf.Indices.length)
	{
		buf.RendererNativeArray = null;
		this.createRendererNativeArray(buf)
		return;
	}
	
	if (buf.RendererNativeArray != null)
	{
		var  gl = this.gl;
		var len = buf.Vertices.length;
		
		var positionsArray = buf.RendererNativeArray.positionsArray;
		var colorArray = buf.RendererNativeArray.colorArray;
		
		for (var i=0; i<len; ++i)
		{
			var v = buf.Vertices[i];
			
			positionsArray[i*3+0] = v.Pos.X;
			positionsArray[i*3+1] = v.Pos.Y;
			positionsArray[i*3+2] = v.Pos.Z;
			
			colorArray[i*4+0] = CL3D.getRed(v.Color)/255.0;
			colorArray[i*4+1] = CL3D.getGreen(v.Color)/255.0;
			colorArray[i*4+2] = CL3D.getBlue(v.Color)/255.0;			
			colorArray[i*4+3] = CL3D.getAlpha(v.Color)/255.0;
		}
		
		gl.bindBuffer(gl.ARRAY_BUFFER, buf.RendererNativeArray.positionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionsArray);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, buf.RendererNativeArray.colorBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, colorArray);
		
		// this is used for particle systems. The indices only update when size of the array changes
		if (buf.RendererNativeArray.indexCount < buf.Indices.length)
		{
			var indexCount = buf.Indices.length;
			var indexArray = new WebGLUnsignedShortArray(indexCount);		
			
			for (var j=0; j<indexCount; j+=3)
			{
				indexArray[j+0] = buf.Indices[j+0];
				indexArray[j+1] = buf.Indices[j+2];
				indexArray[j+2] = buf.Indices[j+1];
			}	

			buf.RendererNativeArray.indexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.RendererNativeArray.indexBuffer);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
			
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		}
		
		buf.RendererNativeArray.indexCount = buf.Indices.length;
		buf.RendererNativeArray.vertexCount = buf.Vertices.length;
	}
}

/**
 * Creates a mesh buffer native render array
 * @private
 */
CL3D.Renderer.prototype.updatePositionsInRendererNativeArray = function(buf)
{
	if (buf.RendererNativeArray != null)
	{
		var  gl = this.gl;
		var len = buf.Vertices.length;
		
		var positionsArray = buf.RendererNativeArray.positionsArray;
		
		for (var i=0; i<len; ++i)
		{
			var v = buf.Vertices[i];
			
			positionsArray[i*3+0] = v.Pos.X;
			positionsArray[i*3+1] = v.Pos.Y;
			positionsArray[i*3+2] = v.Pos.Z;
		}
		
		gl.bindBuffer(gl.ARRAY_BUFFER, buf.RendererNativeArray.positionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionsArray);
	}
}


/**
 * Creates a mesh buffer native render array
 * @private
 */
CL3D.Renderer.prototype.createRendererNativeArray = function(buf)
{
	if (buf.RendererNativeArray == null)
	{
		var  gl = this.gl;
		var obj = new Object();
		var len = buf.Vertices.length;
		
		var positionsArray = new WebGLFloatArray(len*3);		
		var normalsArray = new WebGLFloatArray(len*3);
		var tcoordsArray = new WebGLFloatArray(len*2);
		var tcoordsArray2 = new WebGLFloatArray(len*2);
		var colorArray = new WebGLFloatArray(len*4);
		
		var tangentsArray = null;
		var binormalsArray = null;
		if (buf.Tangents)
			tangentsArray = new WebGLFloatArray(len*3);
		if (buf.Binormals)
			binormalsArray = new WebGLFloatArray(len*3);
	
		for (var i=0; i<len; ++i)
		{
			var v = buf.Vertices[i];
			
			positionsArray[i*3+0] = v.Pos.X;
			positionsArray[i*3+1] = v.Pos.Y;
			positionsArray[i*3+2] = v.Pos.Z;
			
			normalsArray[i*3+0] = v.Normal.X;
			normalsArray[i*3+1] = v.Normal.Y;
			normalsArray[i*3+2] = v.Normal.Z;
			
			tcoordsArray[i*2+0] = v.TCoords.X;
			tcoordsArray[i*2+1] = v.TCoords.Y;
			
			tcoordsArray2[i*2+0] = v.TCoords2.X;
			tcoordsArray2[i*2+1] = v.TCoords2.Y;
			
			colorArray[i*4+0] = CL3D.getRed(v.Color)/255.0;
			colorArray[i*4+1] = CL3D.getGreen(v.Color)/255.0;
			colorArray[i*4+2] = CL3D.getBlue(v.Color)/255.0;			
			colorArray[i*4+3] = CL3D.getAlpha(v.Color)/255.0;
		}	
		
		if (tangentsArray && binormalsArray)
		{
			for (var i=0; i<len; ++i)
			{
				var t = buf.Tangents[i];
				
				tangentsArray[i*3+0] = t.X;
				tangentsArray[i*3+1] = t.Y;
				tangentsArray[i*3+2] = t.Z;
				
				var b = buf.Binormals[i];
				
				binormalsArray[i*3+0] = b.X;
				binormalsArray[i*3+1] = b.Y;
				binormalsArray[i*3+2] = b.Z;
			}
		}

		var indexCount = buf.Indices.length;
		var indexArray = new WebGLUnsignedShortArray(indexCount);		
		
		for (var j=0; j<indexCount; j+=3)
		{
			indexArray[j+0] = buf.Indices[j+0];
			indexArray[j+1] = buf.Indices[j+2];
			indexArray[j+2] = buf.Indices[j+1];
		}		
		
		// create render arrays
				
		obj.positionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, obj.positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positionsArray, gl.DYNAMIC_DRAW); //gl.STATIC_DRAW); // set to dynamic draw to make it possible to update it later
		obj.positionsArray = positionsArray; // storing it for making it possible to update this later
		
		obj.texcoordsBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, obj.texcoordsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, tcoordsArray, gl.STATIC_DRAW);
		
		obj.texcoordsBuffer2 = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, obj.texcoordsBuffer2);
		gl.bufferData(gl.ARRAY_BUFFER, tcoordsArray2, gl.STATIC_DRAW);
		
		obj.normalBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, obj.normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, normalsArray, gl.STATIC_DRAW);
		
		if (tangentsArray && binormalsArray)
		{
			obj.tangentBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, obj.tangentBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, tangentsArray, gl.STATIC_DRAW);
			
			obj.binormalBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, obj.binormalBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, binormalsArray, gl.STATIC_DRAW);
		}
		
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		
		obj.colorBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, obj.colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colorArray, gl.STATIC_DRAW);
		obj.colorArray = colorArray; // storing it for making it possible to update this later
				
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		obj.indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
		
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	
		// finalize
		
		obj.gl = gl;
		obj.indexCount = indexCount;
		obj.vertexCount = len;
		
		buf.RendererNativeArray = obj;    
		buf.OnlyPositionsChanged = false;
		buf.OnlyUpdateBufferIfPossible = false;
	}
}

/**
 * @private
 */
CL3D.Renderer.prototype.drawWebGlStaticGeometry = function(b, indexCountToUse)
{
	//CL3D.gCCDebugOutput.print("drawElementsBegin with " + b.indexCount + " indices " + b.positionBuffer + " " + b.texcoordsBuffer + " " + b.normalBuffer);
	
	var  gl = this.gl;
	
	var withTangentsAndBinormals = b.tangentBuffer && b.binormalBuffer;
	
	// enable all of the vertex attribute arrays.
	
	gl.enableVertexAttribArray(0);
	gl.enableVertexAttribArray(1);
	gl.enableVertexAttribArray(2);
	gl.enableVertexAttribArray(3);
	gl.enableVertexAttribArray(4);

	// set up all the vertex attributes for vertices, normals and texCoords

	gl.bindBuffer(gl.ARRAY_BUFFER, b.positionBuffer);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, b.texcoordsBuffer);
	gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, b.texcoordsBuffer2);
	gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, b.normalBuffer);
	gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, b.colorBuffer);
	gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
	
	if (withTangentsAndBinormals)
	{
		gl.enableVertexAttribArray(5);
		gl.enableVertexAttribArray(6);
	
		gl.bindBuffer(gl.ARRAY_BUFFER, b.tangentBuffer);
		gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
	
		gl.bindBuffer(gl.ARRAY_BUFFER, b.binormalBuffer);
		gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
	}

	// bind the index array
	
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.indexBuffer);
	
	// matrices
	
	var mat = new CL3D.Matrix4(false);
	this.Projection.copyTo(mat);
	mat = mat.multiply(this.View);
	mat = mat.multiply(this.World);
	
	// set world view projection matrix
	var program = this.currentGLProgram;
	if (program.locWorldViewProj != null)
		gl.uniformMatrix4fv(program.locWorldViewProj, false, this.getMatrixAsWebGLFloatArray(mat));
	
	// set normal matrix
	if (program.locNormalMatrix != null)
	{
		// set the normal matrix
		
		var matnormal = new CL3D.Matrix4(true);
		matnormal = matnormal.multiply(this.View);
		matnormal = matnormal.multiply(this.World);
		matnormal.makeInverse();
		matnormal = matnormal.getTransposed(); // the second argument below, 'false', cannot be set to true because it doesn't work, so we have to transpose it ourselves
		
		gl.uniformMatrix4fv(program.locNormalMatrix, false, this.getMatrixAsWebGLFloatArray(matnormal));
	}

	// set model view
	if (program.locModelViewMatrix != null)
	{
		// set the model view matrix
		
		var matmodelview = new CL3D.Matrix4(true);
		matmodelview = matmodelview.multiply(this.View);
		matmodelview = matmodelview.multiply(this.World);
		
		gl.uniformMatrix4fv(program.locModelViewMatrix, false, this.getMatrixAsWebGLFloatArray(matmodelview));
	}
	
	// set model view
	if (program.locModelWorldMatrix != null)
	{
		// set the model world matrix		
		gl.uniformMatrix4fv(program.locModelWorldMatrix, false, this.getMatrixAsWebGLFloatArray(this.World.getTransposed()));
	}
	
	// set light values
	if (program.locLightPositions != null)
		this.setDynamicLightsIntoConstants(program, withTangentsAndBinormals, withTangentsAndBinormals); // when using normal maps, we need word space coordinates of the light positions
	
	// draw
	
	if (indexCountToUse == null)
		indexCountToUse = b.indexCount;
		
    gl.drawElements(gl.TRIANGLES, indexCountToUse, gl.UNSIGNED_SHORT, 0);
	
	//CL3D.gCCDebugOutput.print("drawElementsEnd");
	
	// unbind optional buffers
	
	if (withTangentsAndBinormals)
	{
		gl.disableVertexAttribArray(5);
		gl.disableVertexAttribArray(6);
		
		/*gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
	
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);*/
	}
}

/**
 * @private
 */
CL3D.Renderer.prototype.setDynamicLightsIntoConstants = function(program, useWorldSpacePositionsForLights, useOldNormalMappingAttenuationCalculation)
{
	// we use two contants per light, where we pack Position, Color and Attenuation into, like this:
	// (px, py, pz, att) and (cr, cg, cb, 1)
	
	var buf1 = new ArrayBuffer(4 * 4 * Float32Array.BYTES_PER_ELEMENT);
	var positionArray = new WebGLFloatArray(buf1);
	
	var buf2 = new ArrayBuffer(5 * 4 * Float32Array.BYTES_PER_ELEMENT);
	var colorArray = new WebGLFloatArray(buf2);

	// calculate matrix to transform light position into object space (unless useWorldSpacePositionsForLights is true)
	
	var mat = new CL3D.Matrix4(true);
	
	if (!useWorldSpacePositionsForLights && ((this.Lights != null && this.Lights.length > 0) || this.DirectionalLight != null))
		this.World.getInverse(mat);
	
	// add all lights
	
	for (var i=0; i<4; ++i)
	{
		var idx = i*4;
		
		if (this.Lights != null && i < this.Lights.length)
		{
			var l = this.Lights[i];
			
			var vt = mat.getTransformedVect(l.Position); // we need to set the position of the light in the current object's space
			
			positionArray[idx]   = vt.X; 
			positionArray[idx+1] = vt.Y; 
			positionArray[idx+2] = vt.Z;
			
			var attenuation = 1.0;

			if (useOldNormalMappingAttenuationCalculation)			
				attenuation = 1.0 / (l.Radius * l.Radius); 
			else
				attenuation = l.Attenuation;			
				
			positionArray[idx+3] = attenuation;
			
			colorArray[idx]   = l.Color.R; 
			colorArray[idx+1] = l.Color.G; 
			colorArray[idx+2] = l.Color.B; 
			colorArray[idx+3] = 1; 
		}
		else
		{
			// add a dark light, since the shader expects 4 lights
			
			positionArray[idx]   = 1; 
			positionArray[idx+1] = 0; 
			positionArray[idx+2] = 0; 
			positionArray[idx+3] = 1.0; 
			
			colorArray[idx]   = 0; 
			colorArray[idx+1] = 0; 
			colorArray[idx+2] = 0; 
			colorArray[idx+3] = 1;
		}
	}
	
	// add ambient light
	
	colorArray[16] = this.AmbientLight.R; 
	colorArray[17] = this.AmbientLight.G; 
	colorArray[18] = this.AmbientLight.B; 
	colorArray[19] = 1.0; 
		
	// send point lights and ambient light to 3d card
	
	this.gl.uniform4fv(program.locLightPositions, positionArray);
	this.gl.uniform4fv(program.locLightColors, colorArray);
		
	// add directional light
	
	if (program.locDirectionalLight != null)
	{
		var dirlight = this.DirectionalLight;
		
		var dir = null;
		
		if (dirlight && dirlight.Direction)
			dir = dirlight.Direction.clone();
		else
			dir = new CL3D.Vect3d(1,0,0);
			
		dir.multiplyThisWithScal(-1.0);
		
		mat.rotateVect(dir);
		dir.normalize();
			
		this.gl.uniform3f(program.locDirectionalLight, dir.X, dir.Y, dir.Z, 1.0);
		
		if (dirlight)
			this.gl.uniform4f(program.locDirectionalLightColor, dirlight.Color.R, dirlight.Color.G, dirlight.Color.B, 1.0);
		else
			this.gl.uniform4f(program.locDirectionalLightColor, 0.0, 0.0, 0.0, 1.0);
	}
}


/**
 * @private
 * Draws a 3d line with the current material
 */
CL3D.Renderer.prototype.draw3DLine = function(vect3dFrom, vect3dTo)
{
	// TODO: implement
	 //gl.drawElements(gl.LINES, b.indexCount, gl.UNSIGNED_SHORT, 0);
}

/**
 * Draws a 2d rectangle
 * @public
 * @param x {Number} x coordinate in pixels 
 * @param y {Number} y coordinate in pixels 
 * @param width {Number} width of the rectangle in pixels 
 * @param height {Number} height of the rectangle in pixels 
 * @param color {Number} color of the rectangle. See CL3D.createColor()
 * @param blend {Boolean} (optional) set to true to enable alpha blending (using the alpha component of the color) and false not to blend
 */
CL3D.Renderer.prototype.draw2DRectangle = function(x, y, width, height, color, blend)
{
	if (width <= 0 || height <= 0 || this.width == 0 || this.height == 0)
		return;
		
	var doblend = true;
	if (blend == null || blend == false)
		doblend = false;	
		
	var  gl = this.gl;
	
	gl.enableVertexAttribArray(0);
	gl.disableVertexAttribArray(1);
	gl.disableVertexAttribArray(2);
	gl.disableVertexAttribArray(3);
	gl.disableVertexAttribArray(4);
	
	// transform to view
	
	y = this.height - y; // upside down
	var xFact = 2.0 / this.width;
	var yFact = 2.0 / this.height;
	
	x = (x * xFact) - 1;
	y = (y * yFact) - 1;
	width *= xFact;
	height *= yFact;
		
	// positions 
	
	var positionsArray = new WebGLFloatArray(4*3);	
	
	positionsArray[0] = x;
	positionsArray[1] = y;
	positionsArray[2] = 0;
	
	positionsArray[3] = x + width;
	positionsArray[4] = y;
	positionsArray[5] = 0;
	
	positionsArray[6] = x + width;
	positionsArray[7] = y - height;
	positionsArray[8] = 0;
	
	positionsArray[9] = x;
	positionsArray[10] = y - height;
	positionsArray[11] = 0;
	
	// indices
	
	var indexCount = 6;
	var indexArray = new WebGLUnsignedShortArray(indexCount);		
	indexArray[0] = 0;
	indexArray[1] = 2;
	indexArray[2] = 1;
	indexArray[3] = 0;
	indexArray[4] = 3;
	indexArray[5] = 2;
	
	// create render arrays
				
	var positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, positionsArray, gl.STATIC_DRAW);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
	
	var indexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

	// set shader
	
	this.currentGLProgram = this.Program2DDrawingColorOnly;
	gl.useProgram(this.currentGLProgram);
	
	// set color
	
	gl.uniform4f(gl.getUniformLocation(this.currentGLProgram, "vColor"), 
		CL3D.getRed(color)   / 255,
		CL3D.getGreen(color) / 255,
		CL3D.getBlue(color)  / 255,
		doblend ? (CL3D.getAlpha(color) / 255) : 1.0);
		
		
	// set blend mode and other tests
	
	gl.depthMask(false);
	gl.disable(gl.DEPTH_TEST);
	
	if (!doblend)
	{
		gl.disable(gl.BLEND);
	}
	else
	{
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	}
		
	// draw
			
	gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
	
	// clean up again
	gl.deleteBuffer(positionBuffer);
	gl.deleteBuffer(indexBuffer);
}

/**
 * Draws a 2d image
 * @public
 * @param {Number} x x coordinate in pixels 
 * @param {Number} y y coordinate in pixels 
 * @param {Number} width width of the rectangle in pixels 
 * @param {Number} height height of the rectangle in pixels 
 * @param {CL3D.Texture} tex texture to draw
 * @param {Boolean} blend (optional) set to true to enable alpha blending (using the alpha component of the color) and false not to blend
 * @param shaderToUse (optional) shader to be used or null if the default shader should be used. Set this to something returned by getGLProgramFromMaterialType() for example.
 */
CL3D.Renderer.prototype.draw2DImage = function(x, y, width, height, tex, blend, shaderToUse, srcRightX, srcBottomY)
{		
	if (tex == null || tex.isLoaded() == false || width <= 0 || height <= 0 || this.width == 0 || this.height == 0)
		return;
		
	if (srcRightX == null)
		srcRightX = 1.0;
	if (srcBottomY == null)
		srcBottomY = 1.0;
				
	var doblend = true;
	if (blend == null || blend == false)
		doblend = false;	
		
	var  gl = this.gl;
	
	gl.enableVertexAttribArray(0);
	gl.enableVertexAttribArray(1);
	gl.disableVertexAttribArray(2);
	gl.disableVertexAttribArray(3);
	gl.disableVertexAttribArray(4);
	
	// transform to view
	
	y = this.height - y; // upside down
	var xFact = 2.0 / this.width;
	var yFact = 2.0 / this.height;
	
	x = (x * xFact) - 1;
	y = (y * yFact) - 1;
	width *= xFact;
	height *= yFact;
		
	// positions 
	
	var positionsArray = new WebGLFloatArray(4*3);	
	
	positionsArray[0] = x;
	positionsArray[1] = y;
	positionsArray[2] = 0;
	
	positionsArray[3] = x + width;
	positionsArray[4] = y;
	positionsArray[5] = 0;
	
	positionsArray[6] = x + width;
	positionsArray[7] = y - height;
	positionsArray[8] = 0;
	
	positionsArray[9] = x;
	positionsArray[10] = y - height;
	positionsArray[11] = 0;
	
	// texture coordinates
	
	var tcoordsArray = new WebGLFloatArray(4*2);	
	
	tcoordsArray[0] = 0;
	tcoordsArray[1] = 0;
	
	tcoordsArray[2] = srcRightX;
	tcoordsArray[3] = 0;
	
	tcoordsArray[4] = srcRightX;
	tcoordsArray[5] = srcBottomY;
	
	tcoordsArray[6] = 0;
	tcoordsArray[7] = srcBottomY;
	
	// indices
	
	var indexCount = 6;
	var indexArray = new WebGLUnsignedShortArray(indexCount);		
	indexArray[0] = 0;
	indexArray[1] = 2;
	indexArray[2] = 1;
	indexArray[3] = 0;
	indexArray[4] = 3;
	indexArray[5] = 2;
	
	// create render arrays
				
	var positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, positionsArray, gl.STATIC_DRAW);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
	
	var tcoordsBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, tcoordsBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, tcoordsArray, gl.STATIC_DRAW);
	gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
	
	var indexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
		
	// set shader
	
	if (shaderToUse == null)
		this.currentGLProgram = this.Program2DDrawingTextureOnly;
	else
		this.currentGLProgram = shaderToUse;	
	
	gl.useProgram(this.currentGLProgram);

	// set blend mode and other tests
	
	gl.depthMask(false);
	gl.disable(gl.DEPTH_TEST);
	
	if (!doblend)
	{
		gl.disable(gl.BLEND);
	}
	else
	{
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	}
	
	// set texture
	
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, tex.getWebGLTexture());
	
	// disable blur 
	
	//var disableBlur = false;
	//
	//if (disableBlur)
	//{		
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	//}
		
	// texture clamping
		
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			
	// disable texture 2 
	
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, null);
		
	// draw
			
	gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
	
	// clean up again
	
	gl.deleteBuffer(tcoordsBuffer);
	gl.deleteBuffer(positionBuffer);
	gl.deleteBuffer(indexBuffer);
	
	//if (disableBlur)
	//{
	//	// enable again
	//	gl.activeTexture(gl.TEXTURE0);
	//	gl.bindTexture(gl.TEXTURE_2D, tex.getWebGLTexture());
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
	//}
}

/**
 * @private
 * internal drawing function for drawing 2d overlay fonts
 */
CL3D.Renderer.prototype.draw2DFontImage = function(x, y, width, height, tex, color)
{
	if (tex == null || tex.isLoaded() == false || width <= 0 || height <= 0 || this.width == 0 || this.height == 0)
		return;
		
	var doblend = true;
	var gl = this.gl;
		
	this.currentGLProgram = this.Program2DDrawingCanvasFontColor;
	gl.useProgram(this.currentGLProgram);
	
	// TODO: in the latest release, non-power-of-two textures do not work anymore, so ALL
	// out font textures are scaled up. we need to fix this later by drawing them with the actual size and not scaling them up
	
	// set color
	
	gl.uniform4f(gl.getUniformLocation(this.currentGLProgram, "vColor"), 
		CL3D.getRed(color)   / 255,
		CL3D.getGreen(color) / 255,
		CL3D.getBlue(color)  / 255,
		doblend ? (CL3D.getAlpha(color) / 255) : 1.0);
		
	//this.draw2DImage(x, y, width, height, tex, doblend, this.Program2DDrawingCanvasFontColor, );
	
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	
	this.draw2DImage(x, y, width, height, tex, doblend, this.Program2DDrawingCanvasFontColor, tex.OriginalWidth / tex.CachedWidth, tex.OriginalHeight / tex.CachedHeight);
}


/**
 * Starts the drawing process by clearing the whole scene. Is called by {@link CopperLicht.draw3dScene}(),
 * so it shouldn't be necessary to call this yourself.
 * @public
 * @param clearColor {Number} Color for the background. See {@link CL3D.createColor}.
 */
CL3D.Renderer.prototype.beginScene = function(clearColor)
{
	if (this.gl == null)
		return;
		
	//CL3D.gCCDebugOutput.print("drawBegin");
		
	// adjust size 
	this.ensuresizeok();
	
	// clear graphics here

	var gl = this.gl;
	
	gl.depthMask(true);
	gl.clearColor(	CL3D.getRed(clearColor) / 255.0, 
					CL3D.getGreen(clearColor) / 255.0, 
					CL3D.getBlue(clearColor) / 255.0, 
					1); //CL3D.getAlpha(clearColor) / 255.0);
					
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}


/**
 * Ends the drawing process by flushing the renderin instructions. Is called by {@link CopperLicht.draw3dScene}(),
 * so it shouldn't be necessary to call this yourself.
 * @public
 */
CL3D.Renderer.prototype.endScene = function()
{
	if (this.gl == null)
		return;
		
	var gl = this.gl;
	
	gl.flush();
	
	//CL3D.gCCDebugOutput.print("drawEnd");
}

/**
 * Clears all dynamic lights in the rendering pipeline. Is called by {@link CopperLicht.draw3dScene}(),
 * so it shouldn't be necessary to call this yourself.
 * @public
 */
CL3D.Renderer.prototype.clearDynamicLights = function()
{
	this.Lights = new Array();
	this.DirectionalLight = null;
}

/**
 * Adds a new dynamic light to the rendering pipeline. 
 * @public
  * @param {CL3D.Light} l light data of the light to add
 */
CL3D.Renderer.prototype.addDynamicLight = function(l)
{
	this.Lights.push(l);
}


/**
 * Sets the current dynamic directional light to the rendering pipeline. 
 * The renderer supports an unlimited amount of point lights and one directional light.
 * @public
  * @param {CL3D.Light} l light data of the light to add
 */
CL3D.Renderer.prototype.setDirectionalLight = function(l)
{
	this.DirectionalLight = l;
}


/**
 * @private
 */
CL3D.Renderer.prototype.ensuresizeok = function()
{
	if (this.canvas == null  || this.gl == null)
		return;
	
	if (this.width == this.canvas.width &&
	    this.height == this.canvas.height)
		return;
	
	this.width = this.canvas.width;
	this.height = this.canvas.height;

	var gl = this.gl;
	
	// Set the viewport and projection matrix for the scene
	if (gl.viewport)
		gl.viewport(0, 0, this.width, this.height);

	//CL3D.gCCDebugOutput.print("adjusted size: " + this.width + " " + this.height);
}

/**
 * @private
 */
CL3D.Renderer.prototype.init = function(canvaselement)
{	
	this.canvas = canvaselement;
	this.gl = null;
	try
	{
		//this.gl = canvaselement.getContext("2d");
		
		var names = [ "webgl", "experimental-webgl", "moz-webgl", "webkit-3d", "3d" ];

		for (var i=0; i<names.length; i++) 
		{
			try 
			{ 
				this.gl = this.canvas.getContext(names[i], {alpha: false }); // { antialias: true }
				if (this.gl != null) 
				{
					//CL3D.gCCDebugOutput.print("initialized renderer with: " + names[i]);
					break;
				}
			} 
			catch (e)
			{ 
				//CL3D.gCCDebugOutput.printError("error trying:" + e.message);
			}
		}
	} 
	catch (e) 
	{
	}
	
	if (this.gl == null)
	{
		//CL3D.gCCDebugOutput.printError("Error: This browser does not support WebGL (or it is disabled).");
		//CL3D.gCCDebugOutput.printError("See www.ambiera.com/copperlicht/browsersupport.html for details.");
		return false;
	}
	else
	{
		this.removeCompatibilityProblems();
		this.ensureCorrectMethodNamesSetForClosure();		
		this.initWebGL();
		this.ensuresizeok();
	}
	
	return true;
}

/**
 * @private
 */
CL3D.Renderer.prototype.removeCompatibilityProblems = function()
{
	// WebKit and Chrome: 
	// 20. Aug 2010: WebGLFloatArray has been renamed to Float32Array and 
	// WebGLUnsignedShortArray to Uint16Array
	
	if ( typeof WebGLFloatArray == 'undefined' &&
	     typeof Float32Array != 'undefined' )
	{
		try
		{
			WebGLFloatArray = Float32Array;
			WebGLUnsignedShortArray = Uint16Array;
		}
		catch (e) 
		{
			CL3D.gCCDebugOutput.printError("Error: Float32 array types for webgl not found.");
		}
	}
	
	/*
	if ( typeof WebGLIntArray == 'undefined' &&
	     typeof Int32Array != 'undefined' )
	{
		try
		{
			WebGLIntArray = Int32Array;
		}
		catch (e) 
		{
			CL3D.gCCDebugOutput.printError("Error: Int32 array types for webgl not found.");
		}
	}
	*/	

	// Firefox:
	// The WebGL*Array where named Canvas*Array in the past.
	// However, this will only affect old nightly builds. The current nightly does already
	// support the new names. (13 Dec 2009).	
	if ( typeof WebGLFloatArray == 'undefined' &&
	     typeof CanvasFloatArray != 'undefined' )
	{
		try
		{
			WebGLFloatArray = CanvasFloatArray;
			WebGLUnsignedShortArray = CanvasUnsignedShortArray;
			
			// others, not used by copperlicht
			//WebGLArrayBuffer = CanvasArrayBuffer;
			//WebGLByteArray = CanvasByteArray;
			//WebGLUnsignedByteArray = CanvasUnsignedByteArray;
			//WebGLShortArray = CanvasShortArray;			
			//WebGLIntArray = CanvasIntArray;
			//WebGLUnsignedIntArray = CanvasUnsignedIntArray;
			
		}
		catch (e) 
		{
			CL3D.gCCDebugOutput.printError("Error: canvas array types for webgl not found.");
		}
	}

	var gl = this.gl;
	
	// Google Chrome compatibility code
	// Since a JavaScript function may have multiple return types, functions 
	// 'getProgrami' and 'getShaderi' where renamed. However, Chrome does still
	// use the old names.  (30 Nov 2009)
	if (!gl['getProgramParameter'])
		gl['getProgramParameter'] = gl['getProgrami'];
	if (!gl['getShaderParameter'])
		gl['getShaderParameter'] = gl['getShaderi'];
}

/**
 * @private
 */
CL3D.Renderer.prototype.loadShader = function(shaderType, shaderSource) 
{
	var gl = this.gl;
    var shader = gl.createShader(shaderType);
    if (shader == null) 
		return null;	
		
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) 
	{
		if (this.printShaderErrors)
		{
			var strType = (shaderType == gl.VERTEX_SHADER) ? "vertex" : "fragment";
			CL3D.gCCDebugOutput.printError("Error loading " + strType + " shader: " + gl.getShaderInfoLog(shader));
		}
        return null;
    }    
 
    return shader;
}


/**
 * @private
 */
CL3D.Renderer.prototype.createShaderProgram = function(vertexShaderSource, fragmentShaderSource, useBinormalsAndTangents)
{
	// create shader
	
	var gl = this.gl;
	
	var finalVertexShader = vertexShaderSource;
	var finalFramentShader = fragmentShaderSource;
	
	var midump_append = 
	"#ifdef GL_ES												\n\
	precision mediump float;									\n\
	#endif														\n";
	
	if ( finalVertexShader.indexOf('precision ') == -1 )
		finalVertexShader = midump_append + vertexShaderSource;
		
	if ( finalFramentShader.indexOf('precision ') == -1 )
		finalFramentShader = midump_append + fragmentShaderSource;
		
	var vertexShader = this.loadShader(gl.VERTEX_SHADER, finalVertexShader);
	var fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, finalFramentShader);
	
	if (!vertexShader || !fragmentShader)
	{
		if (this.printShaderErrors)
			CL3D.gCCDebugOutput.print("Could not create shader program");
		 return null;
	}
		 
	// create program
	
	// create program object
	var program = gl.createProgram();
	 
	// attach our two shaders to the program
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	 
	// setup attributes (optional)
	gl.bindAttribLocation(program, 0, "vPosition");
	gl.bindAttribLocation(program, 1, "vTexCoord1");
	gl.bindAttribLocation(program, 2, "vTexCoord2");
	gl.bindAttribLocation(program, 3, "vNormal");	
	gl.bindAttribLocation(program, 4, "vColor");	
	
	if (useBinormalsAndTangents)
	{
		gl.bindAttribLocation(program, 5, "vBinormal");	
		gl.bindAttribLocation(program, 6, "vTangent");	
	}
	
	//gl.bindTexture(gl.TEXTURE_2D, mat.Tex1.Texture);
	 
	// linking
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) 
	{
		if (this.printShaderErrors)
			CL3D.gCCDebugOutput.print("Could not link program:" + gl.getProgramInfoLog(program));
	}
	else
	{
		gl.useProgram(program);
		gl.uniform1i(gl.getUniformLocation(program, "texture1"), 0);
		gl.uniform1i(gl.getUniformLocation(program, "texture2"), 1);
	}
	 
	// setup uniforms (optional)
	//this.gl.useProgram(program);
	//this.gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
	
	return program;
}

/**
 * Creates a new CL3D.Material type with custom shaders. Returns an id which can be used in {@link Material.Type}.
 * There is a tutorial showing how to create a new CL3D.Material in the documentation, but also this short
 * example may give an overview:
 * @public
 * @example 
 * // add a cube to test out
 * var cubenode = new CubeSceneNode();
 * scene.getRootSceneNode().addChild(cubenode);
 * cubenode.getMaterial(0).Tex1 = 
 *   engine.getTextureManager().getTexture("crate_wood.jpg", true);
 *
 * // now, we want to use a custom material for our cube, lets write
 * // a vertex and a fragment shader:
 * // (note: there must be no character, even no space behind 
 * // the '\' characters).
 * var vertex_shader = "           \
 *   uniform mat4 worldviewproj;   \
 *   attribute vec4 vPosition;     \
 *   attribute vec4 vNormal;       \
 *   attribute vec2 vTexCoord1;    \
 *   attribute vec2 vTexCoord2;    \
 *   varying vec2 v_texCoord1;     \
 *   varying vec2 v_texCoord2;     \
 *   void main()                   \
 *   {                             \
 *     gl_Position = worldviewproj * vPosition;\
 *     v_texCoord1 = vTexCoord1.st; \
 *     v_texCoord2 = vTexCoord2.st; \
 *   }";
 *   
 *  var fragment_shader = "        \
 *   uniform sampler2D texture1;   \
 *   uniform sampler2D texture2;   \
 *                                 \
 *   varying vec2 v_texCoord1;     \
 *   varying vec2 v_texCoord2;     \
 *                                 \
 *   void main()                   \
 *   {                             \
 *     vec2 texCoord = vec2(v_texCoord1.s, v_texCoord1.t); \
 *     gl_FragColor = texture2D(texture1, texCoord) * 2; \
 *   }";
 *  
 *  // create a solid material using the shaders. For transparent materials, 
 *  // take a look at the other parameters of createMaterialType  
 *  var newMaterialType = engine.getRenderer().createMaterialType(vertex_shader, fragment_shader);
 *  if (newMaterialType != -1)
 *    cubenode.getMaterial(0).Type = newMaterialType;
 *  else
 *    alert('could not create shader');
 * @param vertexShaderSource {String} Source for the vertex shader of the new CL3D.Material. CopperLicht will set the current
 *  World-View-Projection matrix in an attribute named 'worldviewproj' (if existing), the world transformation matrix into 'worldtransform', the normal transformation matrix in an attribute named 
 *  'normaltransform' if available, and the concatenated view model transformation into an attribute named 'modelviewtransform', if available.
 * Positions will be stored in vPosition, 
 * normals in vNormal, the first texture coordinate in vTexCoord1 and the second in vTexCoord2.
 * All other variables will need to be set manually by you. Use {@link getGLProgramFromMaterialType} to do this.
 * @param fragmentShaderSource {String} Source for the fragment shader of the new CL3D.Material. If the fragment shader uses a variable 'texture1' and 'texture2' as in the example above, CopperLicht will set this to the textures of the current material.
 * @param blendenabled  {Boolean} this is optional and can be set to true to enable blending. See next two parameters. Note: When creating
 * a transparent material, in order to let it be sorted correctly by CopperLicht, override the {@link Material.isTransparent} to return true for
 * your material type.
 * @param blendsfactor this is optional. Blend source factor, when blending is enabled. Set to a webGL blend factor like gl.ONE or gl.SRC_ALPHA. You can get the gl object by using {@link getWebGL()}.
 * @param blenddfactor this is optional. Blend destination factor, when blending is enabled. Set to a webGL blend factor like gl.ONE_MINUS_SRC_ALPHA or gl.ONE_MINUS_SRC_COLOR. You can get the gl object by using {@link getWebGL()}.
 */
CL3D.Renderer.prototype.createMaterialType = function(vertexShaderSource, fragmentShaderSource, blendenabled, blendsfactor, blenddfactor)
{
	var program = this.createMaterialTypeInternal(vertexShaderSource, fragmentShaderSource, blendenabled, blendsfactor, blenddfactor);
	if (!program)
		return -1;
		
	this.MinExternalMaterialTypeId += 1;		
	this.MaterialPrograms[this.MinExternalMaterialTypeId] = program;
	this.MaterialProgramsWithLight[this.MinExternalMaterialTypeId] = program;
	
	return this.MinExternalMaterialTypeId;
}



/**
 * Returns the webgl shader program from a material type. This is useful when you are using {@link createMaterialType} to create your
 * own shaders and need to set material constants using for example uniform1i.
 * @public
 * @param mattype {int} The material type, like for example {@link Material.EMT_SOLID}, or your own material type returned by {@link createMaterialType}.
 * @returns {program} Returns the WebGL shader program or null if not found.
 */
CL3D.Renderer.prototype.getGLProgramFromMaterialType = function(mattype)
{
	var program = null;
	try
	{
		program = this.MaterialPrograms[mattype];
	}
	catch(e) {}
	
	return program;
}


/**
 * @private
 */
CL3D.Renderer.prototype.createMaterialTypeInternal = function(vsshader, fsshader, blendenabled, blendsfactor, blenddfactor, useBinormalsAndTangents)
{
	if (useBinormalsAndTangents == null)
		useBinormalsAndTangents = false;
		
	var program = this.createShaderProgram(vsshader, fsshader, useBinormalsAndTangents);
	if (program)
	{
		// store blend mode
		program.blendenabled = blendenabled ? blendenabled : false;
		program.blendsfactor = blendsfactor;
		program.blenddfactor = blenddfactor;
		
		var gl = this.gl;
		
		// store preset shader attribute locations
		program.locWorldViewProj = gl.getUniformLocation(program, "worldviewproj");
		program.locNormalMatrix = gl.getUniformLocation(program, "normaltransform");
		program.locModelViewMatrix = gl.getUniformLocation(program, "modelviewtransform");
		program.locModelWorldMatrix = gl.getUniformLocation(program, "worldtransform");
		program.locLightPositions = gl.getUniformLocation(program, "arrLightPositions");
		program.locLightColors = gl.getUniformLocation(program, "arrLightColors");
		program.locDirectionalLight = gl.getUniformLocation(program, "vecDirLight");
		program.locDirectionalLightColor = gl.getUniformLocation(program, "colorDirLight");
	}		
		
	return program;
}

/**
 * @private
 */
CL3D.Renderer.prototype.initWebGL = function()
{
	var gl = this.gl;
	
	// don't print shader errors
	this.printShaderErrors = false;
	
	// create shaders
	
	var fallbackShader = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_onlyfirsttexture_gouraud);
	
	var programStandardMaterial = fallbackShader;
	var programLightmapMaterial = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_lightmapcombine);
	var programLightmapMaterial_m4 = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_lightmapcombine_m4);
	var programTransparentAlphaChannel = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_onlyfirsttexture_gouraud, true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	var programTransparentAlphaChannelRef = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_onlyfirsttexture_gouraud_alpharef, true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	var programTransparentAdd = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_onlyfirsttexture_gouraud, true, gl.ONE, gl.ONE_MINUS_SRC_COLOR);
	var programReflectionMaterial = this.createMaterialTypeInternal(this.vs_shader_reflectiontransform, this.fs_shader_lightmapcombine);
	var programTranspReflectionMaterial = this.createMaterialTypeInternal(this.vs_shader_reflectiontransform, this.fs_shader_lightmapcombine, true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	var programGouraudShaded = this.createMaterialTypeInternal(this.vs_shader_normaltransform_gouraud, this.fs_shader_onlyfirsttexture_gouraud);
	var programNormalmappedMaterial = this.createMaterialTypeInternal(this.vs_shader_normalmappedtransform, this.fs_shader_normalmapped);
	var programSolidVertexAlphaTwoTextureBlendMaterial = this.createMaterialTypeInternal(this.vs_shader_normaltransform, this.fs_shader_vertex_alpha_two_textureblend);
	
	this.Program2DDrawingColorOnly = this.createMaterialTypeInternal(this.vs_shader_2ddrawing_coloronly, this.fs_shader_simplecolor);
	this.Program2DDrawingTextureOnly = this.createMaterialTypeInternal(this.vs_shader_2ddrawing_texture, this.fs_shader_onlyfirsttexture);
	this.Program2DDrawingCanvasFontColor = this.createMaterialTypeInternal(this.vs_shader_2ddrawing_texture, this.fs_shader_2ddrawing_canvasfont);
	
	this.MaterialPrograms[CL3D.Material.EMT_SOLID] = programStandardMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_SOLID+1] = programStandardMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_LIGHTMAP] = programLightmapMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_LIGHTMAP+1] = programLightmapMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_LIGHTMAP+2] = programLightmapMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_LIGHTMAP+3] = programLightmapMaterial_m4;
	this.MaterialPrograms[CL3D.Material.EMT_TRANSPARENT_ADD_COLOR] = programTransparentAdd;
	this.MaterialPrograms[CL3D.Material.EMT_TRANSPARENT_ALPHA_CHANNEL] = programTransparentAlphaChannel;
	this.MaterialPrograms[CL3D.Material.EMT_TRANSPARENT_ALPHA_CHANNEL_REF] = programTransparentAlphaChannelRef;
	this.MaterialPrograms[CL3D.Material.EMT_REFLECTION_2_LAYER] = programReflectionMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_TRANSPARENT_REFLECTION_2_LAYER] = programTranspReflectionMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_NORMAL_MAP_SOLID] = programNormalmappedMaterial;
	this.MaterialPrograms[CL3D.Material.EMT_SOLID_VERTEX_ALPHA_TWO_TEXTURE_BLEND] = programSolidVertexAlphaTwoTextureBlendMaterial;
	
	// EMT_ONETEXTURE_BLEND
	this.MaterialPrograms[23] = programGouraudShaded;
	
	// now do the same with materials with lighting
	
	programStandardMaterial = this.createMaterialTypeInternal(this.vs_shader_normaltransform_with_light, this.fs_shader_onlyfirsttexture_gouraud);
	programTransparentAlphaChannel = this.createMaterialTypeInternal(this.vs_shader_normaltransform_with_light, this.fs_shader_onlyfirsttexture_gouraud, true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	programTransparentAlphaChannelRef = this.createMaterialTypeInternal(this.vs_shader_normaltransform_with_light, this.fs_shader_onlyfirsttexture_gouraud_alpharef, true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	programTransparentAdd = this.createMaterialTypeInternal(this.vs_shader_normaltransform_with_light, this.fs_shader_onlyfirsttexture_gouraud, true, gl.ONE, gl.ONE_MINUS_SRC_COLOR);
	
	programReflectionMaterial = this.createMaterialTypeInternal(this.vs_shader_reflectiontransform_with_light, this.fs_shader_lightmapcombine_gouraud);
	programTranspReflectionMaterial = this.createMaterialTypeInternal(this.vs_shader_reflectiontransform_with_light, this.fs_shader_lightmapcombine_gouraud, true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	programSolidVertexAlphaTwoTextureBlendMaterial = this.createMaterialTypeInternal(this.vs_shader_normaltransform_with_light, this.fs_shader_vertex_alpha_two_textureblend);
	
	this.MaterialProgramsWithLight[CL3D.Material.EMT_SOLID] = programStandardMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_SOLID+1] = programStandardMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_LIGHTMAP] = programLightmapMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_LIGHTMAP+1] = programLightmapMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_LIGHTMAP+2] = programLightmapMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_LIGHTMAP+3] = programLightmapMaterial_m4;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_TRANSPARENT_ADD_COLOR] = programTransparentAdd;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_TRANSPARENT_ALPHA_CHANNEL] = programTransparentAlphaChannel;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_TRANSPARENT_ALPHA_CHANNEL_REF] = programTransparentAlphaChannelRef;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_REFLECTION_2_LAYER] = programReflectionMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_TRANSPARENT_REFLECTION_2_LAYER] = programTranspReflectionMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_NORMAL_MAP_SOLID] = programNormalmappedMaterial;
	this.MaterialProgramsWithLight[CL3D.Material.EMT_SOLID_VERTEX_ALPHA_TWO_TEXTURE_BLEND] = programSolidVertexAlphaTwoTextureBlendMaterial;
	
	// reset shader error output
	this.printShaderErrors = true;
	
	// set fallback materials
	for (var f=0; f<this.MinExternalMaterialTypeId; ++f)
	{
		if (this.MaterialPrograms[f] == null)
			this.MaterialPrograms[f] = fallbackShader;
			
		if (this.MaterialProgramsWithLight[f] == null)
			this.MaterialProgramsWithLight[f] = fallbackShader;
	}
	
	// set WebGL default values
	
	gl.useProgram(programStandardMaterial);
	this.currentGLProgram = programStandardMaterial;
		
	gl.clearColor(0, 0, 1, 1);
    gl.clearDepth(10000);

	gl.depthMask(true);
	gl.enable(gl.DEPTH_TEST);
	gl.disable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	//gl.enable(gl.TEXTURE_2D); invalid in webgl
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.BACK);
}

/**
 * Sets the projection transformation matrix. This is automatically called by {@link CopperLicht.draw3dScene}(),
 * so it shouldn't be necessary to call this yourself.
 * @param {CL3D.Matrix4} m matrix representing the transformation matrix.
 * @public
 */
CL3D.Renderer.prototype.setProjection = function(m)
{
	m.copyTo(this.Projection);
}

/**
 * Returns the currently used projection matrix.
 * @public
 */
CL3D.Renderer.prototype.getProjection = function()
{
	return this.Projection;
}

/**
 * Sets the view transformation matrix. This is automatically called by {@link CopperLicht.draw3dScene}(),
 * so it shouldn't be necessary to call this yourself.
 * @param {CL3D.Matrix4} m matrix representing the transformation matrix.
 * @public
 */
CL3D.Renderer.prototype.setView = function(m)
{
	m.copyTo(this.View);
}

/**
 * Returns the currently used view matrix.
 * @public
 */
CL3D.Renderer.prototype.getView = function()
{
	return this.View;
}

/**
 * Returns the currently used view matrix.
 * @public
 */
CL3D.Renderer.prototype.getWorld = function()
{
	return this.World;
}

/**
 * Sets the world transformation matrix. This is automatically called by {@link CopperLicht.draw3dScene}(),
 * so it shouldn't be necessary to call this yourself.
 * @param {CL3D.Matrix4} m matrix representing the transformation matrix.
 * @public
 */
CL3D.Renderer.prototype.setWorld = function(m)
{
	if (m)
		m.copyTo(this.World);	
}

/**
 * @private
 */
CL3D.Renderer.prototype.ensureCorrectMethodNamesSetForClosure = function(m)
{
	// when using google closure compiler, it won't recognize webgl functions, so change them here.
	
	// Update: outcommented because we are no longer using closure
	/*var gl = this.gl;
	
	gl.activeTexture = gl['activeTexture'];
	gl.attachShader = gl['attachShader'];
	gl.blendFunc = gl['blendFunc'];
	gl.bindAttribLocation = gl['bindAttribLocation'];
	gl.bindBuffer = gl['bindBuffer'];
	gl.bindTexture = gl['bindTexture'];
	gl.bufferData = gl['bufferData'];	
	gl.clearColor = gl['clearColor'];
    gl.clearDepth = gl['clearDepth'];
	gl.createShader = gl['createShader'];
	gl.createProgram = gl['createProgram'];
	gl.createBuffer = gl['createBuffer'];
	gl.compileShader = gl['compileShader'];
	gl.createTexture = gl['createTexture'];
	gl.cullFace = gl['cullFace'];
	gl.drawElements = gl['drawElements'];
	gl.disable = gl['disable'];
	gl.deleteBuffer = gl['deleteBuffer'];
	gl.deleteTexture = gl['deleteBuffer'];
	gl.depthMask = gl['depthMask'];
	gl.enable = gl['enable'];
	gl.enableVertexAttribArray = gl['enableVertexAttribArray'];
	gl.disableVertexAttribArray = gl['disableVertexAttribArray'];
	gl.generateMipmap = gl['generateMipmap'];
	gl.vertexAttribPointer = gl['vertexAttribPointer'];
	gl.flush = gl['flush'];	
    gl.getProgramParameter = gl['getProgramParameter'];
	gl.getShaderParameter = gl['getShaderParameter'];
	gl.getShaderInfoLog = gl['getShaderInfoLog'];
	gl.getProgramInfoLog = gl['getProgramInfoLog'];
	gl.getUniformLocation = gl['getUniformLocation'];
	gl.linkProgram = gl['linkProgram'];
	gl.useProgram = gl['useProgram'];
	gl.uniform1i = gl['uniform1i'];
	gl.uniformMatrix4fv = gl['uniformMatrix4fv'];
	gl.uniform4f = gl['uniform4f'];
	gl.viewport = gl['viewport'];
	gl.shaderSource = gl['shaderSource'];
	gl.texImage2D = gl['texImage2D'];
	gl.texParameteri = gl['texParameteri'];
		
	gl.ARRAY_BUFFER = gl['ARRAY_BUFFER'];
	gl.BACK = gl['BACK'];
	gl.BLEND = gl['BLEND'];
	gl.COMPILE_STATUS = gl['COMPILE_STATUS']; 
	gl.COLOR_BUFFER_BIT = gl['COLOR_BUFFER_BIT'];
	gl.COMPILE_STATUS = gl['COMPILE_STATUS'];
	gl.CLAMP_TO_EDGE = gl['CLAMP_TO_EDGE'];
	gl.CULL_FACE = gl['CULL_FACE'];
	gl.DEPTH_BUFFER_BIT = gl['DEPTH_BUFFER_BIT'];
	gl.DEPTH_TEST = gl['DEPTH_TEST'];
	gl.ELEMENT_ARRAY_BUFFER = gl['ELEMENT_ARRAY_BUFFER'];
	gl.FLOAT = gl['FLOAT'];
	gl.FRAGMENT_SHADER = gl['FRAGMENT_SHADER'];
	gl.LINEAR = gl['LINEAR'];
	gl.LINEAR_MIPMAP_NEAREST = gl['LINEAR_MIPMAP_NEAREST'];
	gl.LINK_STATUS = gl['LINK_STATUS'];
	gl.UNSIGNED_BYTE = gl['UNSIGNED_BYTE'];
	gl.UNSIGNED_SHORT = gl['UNSIGNED_SHORT'];
	gl.VERTEX_SHADER = gl['VERTEX_SHADER'];
	gl.ONE_MINUS_SRC_ALPHA = gl['ONE_MINUS_SRC_ALPHA'];	
	gl.ONE_MINUS_SRC_COLOR = gl['ONE_MINUS_SRC_COLOR'];
	gl.ONE = gl['ONE'];
	gl.RGBA = gl['RGBA'];
	gl.SRC_ALPHA = gl['SRC_ALPHA'];
	gl.STATIC_DRAW = gl['STATIC_DRAW'];
	gl.TEXTURE0 = gl['TEXTURE0'];
	gl.TEXTURE1 = gl['TEXTURE1'];
	gl.TEXTURE_2D = gl['TEXTURE_2D'];
	gl.TEXTURE_MAG_FILTER = gl['TEXTURE_MAG_FILTER'];
	gl.TEXTURE_MIN_FILTER = gl['TEXTURE_MIN_FILTER'];
	gl.TEXTURE_WRAP_T = gl['TEXTURE_WRAP_T'];
	gl.TEXTURE_WRAP_S = gl['TEXTURE_WRAP_S'];
	gl.TRIANGLES = gl['TRIANGLES'];	*/
}


/**
 * @private
 */
CL3D.Renderer.prototype.getMatrixAsWebGLFloatArray = function(mat)
{
    return new WebGLFloatArray(mat.asArray());
}

 /**
 * Deletes a {@link Texture}, freeing a lot of memory
 * @public
 * @param {CL3D.Texture} tex the texture to draw
 */
CL3D.Renderer.prototype.deleteTexture = function(tex)
{
	if (tex == null)
		return;
		
	var gl = this.gl;
	gl.deleteTexture(tex.getWebGLTexture());
	
	tex.Texture = null;
	tex.Loaded = false;
}

 /**
 * Replaces the content of a placeholder texture with the content of a new texture.
 * The new texture shouldn't be used anymore after this.
 * Usefult for creating placeholder textures for videos, for example.
 * @private
 */
CL3D.Renderer.prototype.replacePlaceholderTextureWithNewTextureContent = function(placeholderTexture, newtexture)
{
	placeholderTexture.Texture = newtexture.Texture;
	placeholderTexture.CachedWidth = newtexture.CachedWidth;
	placeholderTexture.CachedHeight = newtexture.CachedHeight;
	placeholderTexture.OriginalWidth = newtexture.OriginalWidth;
	placeholderTexture.OriginalHeight = newtexture.OriginalHeight;
}

 /**
 * Fills an existing {@link CL3D.Texture} with the content of a from a 2d canvas
 * @public
 * @param {Canvas} canvas a 2d canvas to be converted into a texture
 * @param {boolean} nonscaling optional parameter, if set to true, and the texture don't have a power-of-two size, the texture will not be scaled up, but copied without scaling. 
 *        This is useful for font or 2D textures, for example, to make them less blurry.
 */
CL3D.Renderer.prototype.updateTextureFrom2DCanvas = function(t, canvas, nonscaling)
{
	var gl = this.gl;
	
	var texture = t.Texture;
	gl.bindTexture(gl.TEXTURE_2D, texture);
	
	var origwidth = canvas.width;
	var origheight = canvas.height;
	
	if (canvas.videoWidth)
		origwidth = canvas.videoWidth;
	if (canvas.videoHeight)
		origheight = canvas.videoHeight;
		
	var scaledUpWidth = origwidth;
	var scaledUpHeight = origheight;
	
	 if (!this.isPowerOfTwo(origwidth) || !this.isPowerOfTwo(origheight))
	 {
        // Scale up the texture to the next highest power of two dimensions.
		
        var tmpcanvas = document.createElement("canvas");
        tmpcanvas.width = this.nextHighestPowerOfTwo(origwidth);
        tmpcanvas.height = this.nextHighestPowerOfTwo(origheight);
        var tmpctx = tmpcanvas.getContext("2d");
		
		tmpctx.fillStyle = "rgba(0, 255, 255, 1)";
		tmpctx.fillRect(0, 0, tmpcanvas.width, tmpcanvas.height);
		
		if (nonscaling)
			tmpctx.drawImage(canvas, 0, 0, origwidth, origheight, 0, 0, origwidth, origheight);
		else
			tmpctx.drawImage(canvas, 0, 0, origwidth, origheight, 0, 0, tmpcanvas.width, tmpcanvas.height);

        canvas = tmpcanvas;
		scaledUpWidth = tmpcanvas.width;
		scaledUpHeight = tmpcanvas.height;
    }
	
	//CL3D.gCCDebugOutput.print("createTextureFrom2DCanvas orig " + origwidth + "x" + origheight + " and scaled" + scaledUpWidth + "x" + scaledUpHeight);
	
	this.fillTextureFromDOMObject(texture, canvas);
	
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
	
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.bindTexture(gl.TEXTURE_2D, null);
}

 /**
 * Creates a {@link CL3D.Texture} from a 2d canvas
 * @public
 * @param {Canvas} canvas a 2d canvas to be converted into a texture
 * @param {boolean} nonscaling optional parameter, if set to true, and the texture don't have a power-of-two size, the texture will not be scaled up, but copied without scaling. 
 *        This is useful for font or 2D textures, for example, to make them less blurry.
 */
CL3D.Renderer.prototype.createTextureFrom2DCanvas = function(canvas, nonscaling)
{
	var gl = this.gl;
	
	var texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	
	var origwidth = canvas.width;
	var origheight = canvas.height;
	
	if (canvas.videoWidth)
		origwidth = canvas.videoWidth;
	if (canvas.videoHeight)
		origheight = canvas.videoHeight;
		
	var scaledUpWidth = origwidth;
	var scaledUpHeight = origheight;
	
	 if (!this.isPowerOfTwo(origwidth) || !this.isPowerOfTwo(origheight))
	 {
        // Scale up the texture to the next highest power of two dimensions.
		
        var tmpcanvas = document.createElement("canvas");
        tmpcanvas.width = this.nextHighestPowerOfTwo(origwidth);
        tmpcanvas.height = this.nextHighestPowerOfTwo(origheight);
        var tmpctx = tmpcanvas.getContext("2d");
		
		//tmpctx.fillStyle = "rgba(0, 255, 255, 1)";
		//tmpctx.fillRect(0, 0, tmpcanvas.width, tmpcanvas.height);
		
		if (nonscaling)
			tmpctx.drawImage(canvas, 0, 0, origwidth, origheight, 0, 0, origwidth, origheight);
		else
			tmpctx.drawImage(canvas, 0, 0, origwidth, origheight, 0, 0, tmpcanvas.width, tmpcanvas.height);

        canvas = tmpcanvas;
		scaledUpWidth = tmpcanvas.width;
		scaledUpHeight = tmpcanvas.height;
    }
	
	//CL3D.gCCDebugOutput.print("createTextureFrom2DCanvas orig " + origwidth + "x" + origheight + " and scaled" + scaledUpWidth + "x" + scaledUpHeight);
	
	this.fillTextureFromDOMObject(texture, canvas);
	
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
	
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	var t = new CL3D.Texture();
	t.Name = "";
	t.Texture = texture;	
	t.Image = null;
	t.Loaded = true;
	t.CachedWidth = scaledUpWidth;
	t.CachedHeight = scaledUpHeight;
	t.OriginalWidth = origwidth;
	t.OriginalHeight = origheight;
	
	return t;
}

/**
 * @private
 */
CL3D.Renderer.prototype.isPowerOfTwo = function(x) 
{
    return (x & (x - 1)) == 0;
}
 
/**
 * @private
 */
CL3D.Renderer.prototype.nextHighestPowerOfTwo = function(x) 
{
    --x;
    for (var i = 1; i < 32; i <<= 1) {
        x = x | x >> i;
    }
    return x + 1;
}

/**
 * @private
 * domobj is an image or a canvas element
 */
CL3D.Renderer.prototype.fillTextureFromDOMObject = function(wgltex, domobj)
{
	var gl = this.gl;
	
	// new version replaced the old:
	//  texImage2D(target, level, HTMLImageElement, [optional] flipY, [optional] premultiplyAlpha)
	//  with the new
	// texImage2D(target, level, internalformat, format, type, HTMLImageElement)
	// concrete:
	try
	{
		// new version
		
		//void texImage2D(GLenum target, GLint level, GLenum internalformat,
        //           GLenum format, GLenum type, HTMLImageElement image) raises (DOMException);		
		
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, domobj);
		
	}
	catch(e)
	{			
		if (e.code != null && DOMException != null && DOMException['SECURITY_ERR'] != null && 
		    e.code == DOMException['SECURITY_ERR'])
		{
			if (this.domainTextureLoadErrorPrinted == false)
				CL3D.gCCDebugOutput.printError("<i>A security setting in the browser prevented loading a texture.<br/>Workaround: run this from a webserver, change security settings, or allow the specific domain.</i>", true);
			
			this.domainTextureLoadErrorPrinted = true;
			return;
		}
			
		//CL3D.gCCDebugOutput.print(browserVersion + "Could not texImage2D texture: " + e);
		
		try
		{
			// old version
			gl.texImage2D(gl.TEXTURE_2D, 0, domobj);
		}
		catch(e2)
		{
			// something is pretty wrong here
			//CL3D.gCCDebugOutput.print("Could not texImage2D texture (2nd try):" + e2);
		}
	}
	
}

/**
 * @private
 */
CL3D.Renderer.prototype.finalizeLoadedImageTexture = function(t)
{
	var gl = this.gl;
	
	var texture = gl.createTexture();	
	var objToCopyFrom = t.Image;
	
	if (!this.isPowerOfTwo(objToCopyFrom.width) || !this.isPowerOfTwo(objToCopyFrom.height))
	{
		// Scale up the texture to the next highest power of two dimensions.
		
		var tmpcanvas = document.createElement("canvas");
		if (tmpcanvas != null)
		{
			tmpcanvas.width = this.nextHighestPowerOfTwo(objToCopyFrom.width);
			tmpcanvas.height = this.nextHighestPowerOfTwo(objToCopyFrom.height);
			var tmpctx = tmpcanvas.getContext("2d");
			tmpctx.drawImage(objToCopyFrom,
						  0, 0, objToCopyFrom.width, objToCopyFrom.height,
						  0, 0, tmpcanvas.width, tmpcanvas.height);
			objToCopyFrom = tmpcanvas;
		}
	}
	
	gl.bindTexture(gl.TEXTURE_2D, texture);
	
	this.fillTextureFromDOMObject(texture, objToCopyFrom);
	
	//  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
	
	// TODO: enable these lines for anisotropic filtering (looks much nicer)
	/*var ext = gl.getExtension('EXT_texture_filter_anisotropic');
	if (ext)
	{
		gl.texParameterf(gl.TEXTURE_2D, ext['TEXTURE_MAX_ANISOTROPY_EXT'], 4);
	}*/
	
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,  gl.LINEAR_MIPMAP_NEAREST);
	
    gl.bindTexture(gl.TEXTURE_2D, null);
	
	this.textureWasLoadedFlag = true;
	
	t.Texture = texture;
}

/**
 * @private
 */
CL3D.Renderer.prototype.getStaticBillboardMeshBuffer = function()
{
	if (this.StaticBillboardMeshBuffer == null)
		this.createStaticBillboardMeshBuffer();
	
	return this.StaticBillboardMeshBuffer;
}

/**
 * @private
 */
CL3D.Renderer.prototype.createStaticBillboardMeshBuffer = function()
{
	if (this.StaticBillboardMeshBuffer != null)
		return;
		
	var mb = null;
		
	mb = new CL3D.MeshBuffer();
	var vtx1 = new CL3D.Vertex3D(true);
	var vtx2 = new CL3D.Vertex3D(true);
	var vtx3 = new CL3D.Vertex3D(true);
	var vtx4 = new CL3D.Vertex3D(true);
	
	var indices = mb.Indices;
	indices.push(0);
	indices.push(2);
	indices.push(1);
	indices.push(0);
	indices.push(3);
	indices.push(2);
	
	var vertices = mb.Vertices;
	vertices.push(vtx1);
	vertices.push(vtx2);
	vertices.push(vtx3);
	vertices.push(vtx4);
	
	vtx1.TCoords.X = 1;
	vtx1.TCoords.Y = 1;
	vtx1.Pos.set(1,-1,0);
	
	vtx2.TCoords.X = 1;
	vtx2.TCoords.Y = 0;
	vtx2.Pos.set(1,1,0);
	
	vtx3.TCoords.X = 0;
	vtx3.TCoords.Y = 0;
	vtx3.Pos.set(-1,1,0);
	
	vtx4.TCoords.X = 0;
	vtx4.TCoords.Y = 1;	
	vtx4.Pos.set(-1,-1,0);
	
	this.StaticBillboardMeshBuffer = mb;
}

// to add shader validation compatible shaders:
// http://www.khronos.org/webgl/public-mailing-list/archives/1007/msg00034.html
// add this on top of every shader:
// #ifdef GL_ES
// precision highp float;
// #endif
// The GL_ES define is not present on desktop, so that line is ignored; however it is present
// when running under validation, because the translator implements GLSL ES.  Note that the precision qualifiers will have // no effect on the desktop (I believe they're just ignored by the translator), but may have an impact on mobile.

// drawing 2d rectangles with a color and a position only
CL3D.Renderer.prototype.vs_shader_2ddrawing_coloronly = "			\
	attribute vec4 vPosition;									\
																\
    void main()													\
    {															\
        gl_Position = vPosition;								\
    }															\
	";
	
// drawing 2d rectangles with an image only
CL3D.Renderer.prototype.vs_shader_2ddrawing_texture = "				\
	attribute vec4 vPosition;									\
	attribute vec4 vTexCoord1;									\
	varying vec2 v_texCoord1;									\
																\
    void main()													\
    {															\
        gl_Position = vPosition;								\
		v_texCoord1 = vTexCoord1.st;							\
    }															\
	";	
	
// 2D Fragment shader: simply set the color from a shader parameter (used for 2d drawing rectangles)
CL3D.Renderer.prototype.fs_shader_simplecolor = "					\
	uniform vec4 vColor;										\
																\
    void main()													\
    {															\
         gl_FragColor = vColor;									\
    }															\
	";								
	
// 2D fragment shader for drawing fonts: The font texture is white/gray on black. Draw the font using the white as alpha,
// multiplied by a color as parameter
CL3D.Renderer.prototype.fs_shader_2ddrawing_canvasfont = "			\
	uniform vec4 vColor;										\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
    varying vec2 v_texCoord1;									\
																\
    void main()													\
    {															\
	    vec2 texCoord = vec2(v_texCoord1.s, v_texCoord1.t);		\
        float alpha = texture2D(texture1, texCoord).r;		\
        gl_FragColor = vec4(vColor.rgb, alpha);						\
    }															\
	";								


// simple normal 3d world 3d transformation shader
CL3D.Renderer.prototype.vs_shader_normaltransform = "				\
	uniform mat4 worldviewproj;									\
																\
	attribute vec4 vPosition;									\
    attribute vec4 vNormal;										\
	attribute vec4 vColor;										\
    attribute vec2 vTexCoord1;									\
	attribute vec2 vTexCoord2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
		v_color = vColor;										\
        gl_Position = worldviewproj * vPosition;				\
        v_texCoord1 = vTexCoord1.st;							\
		v_texCoord2 = vTexCoord2.st;							\
    }															\
	";
	
// simple normal 3d world 3d transformation shader, which also calculates the light of up to 4 point light sources
// // our lighting works like this:
// vertexToLight = lightPos - vertexPos;
// distance = length(vertexToLight)
// distanceFact = 1 /( lightAttenuation * distance )
// vertexToLight = normalize(vertexToLight)
// angle = sin(normal.dotproduct(vertexToLight));
// if (angle < 0) angle = 0;
// intensity = angle * distanceFact;
// color = intensity * lightcolor;		
CL3D.Renderer.prototype.vs_shader_normaltransform_with_light = "				\
	uniform mat4 worldviewproj;									\n\
	uniform vec4 arrLightPositions[4];							\n\
	uniform vec4 arrLightColors[5]; 							\n\
	uniform vec3 vecDirLight; 									\n\
	uniform vec4 colorDirLight; 								\n\
																\
	attribute vec4 vPosition;									\
    attribute vec4 vNormal;										\
	attribute vec4 vColor;										\
    attribute vec2 vTexCoord1;									\
	attribute vec2 vTexCoord2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        gl_Position = worldviewproj * vPosition;				\
        v_texCoord1 = vTexCoord1.st;							\
		v_texCoord2 = vTexCoord2.st;							\
																\n\
		vec3 n = normalize(vec3(vNormal.xyz));					\
		vec4 currentLight = vec4(0, 0, 0, 1.0);					\
		for(int i=0; i<4; ++i)									\
		{														\
			vec3 lPos = vec3(arrLightPositions[i].xyz);			\
			vec3 vertexToLight = lPos - vec3(vPosition.xyz);	\
			float distance = length( vertexToLight );			\
			float distanceFact = 1.0 / (arrLightPositions[i].w * distance); \
			vertexToLight = normalize(vertexToLight); 			\
			float angle = max(0.0, dot(n, vertexToLight));		\
			float intensity = angle * distanceFact;				\
			currentLight = currentLight + vec4(arrLightColors[i].x*intensity, arrLightColors[i].y*intensity, arrLightColors[i].z*intensity, 1.0);		\
		}														\
																\
		// directional light									\n\
		float dirlight = max(0.0, dot(n, vecDirLight));	\
		currentLight = currentLight + vec4(colorDirLight.x*dirlight, colorDirLight.y*dirlight, colorDirLight.z*dirlight, 1.0);		\
																\
		// ambient light										\n\
		currentLight = currentLight + arrLightColors[4];		\
		currentLight = max(currentLight, vec4(0.0,0.0,0.0,0.0));	\
		currentLight = currentLight * vec4(vColor.x, vColor.y, vColor.z, 1.0);	\
		v_color = min(currentLight, vec4(1.0,1.0,1.0,1.0));		\
		v_color.a = vColor.a;	// preserve vertex alpha \n\
    }															\
	";
	
// simple normal 3d world 3d transformation shader
CL3D.Renderer.prototype.vs_shader_normaltransform_gouraud = "				\
	uniform mat4 worldviewproj;									\
																\
	attribute vec4 vPosition;									\
    attribute vec2 vTexCoord1;									\
	attribute vec2 vTexCoord2;									\
	attribute vec4 vNormal;										\
	attribute vec4 vColor;										\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        gl_Position = worldviewproj * vPosition;				\
        v_texCoord1 = vTexCoord1.st;							\
		v_texCoord2 = vTexCoord2.st;							\
		v_color = vColor;										\
    }															\
	";

	
 // 3d world 3d transformation shader generating a reflection in texture coordinate 2
 // normaltransform is the inverse transpose of the upper 3x3 part of the modelview matrix.
 // 
 // this is based on 
 // D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR from D3D9:
 // Use the reflection vector, transformed to camera space, as input texture coordinates. 
 // The reflection vector is computed from the input vertex position and normal vector.
CL3D.Renderer.prototype.vs_shader_reflectiontransform = "		\
	uniform mat4 worldviewproj;									\n\
	uniform mat4 normaltransform;								\n\
	uniform mat4 modelviewtransform;							\n\
	uniform mat4 worldtransform;								\n\
																\
	attribute vec4 vPosition;									\
    attribute vec3 vNormal;										\
    attribute vec2 vTexCoord1;									\
	attribute vec2 vTexCoord2;									\
																\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\n\
		gl_Position = worldviewproj * vPosition;					\n\
																	\n\
		//	use reflection											\n\
		vec3 pos = normalize((modelviewtransform * vPosition).xyz);					\n\
		vec3 n = normalize((normaltransform * vec4(vNormal, 1)).xyz);		\n\
		vec3 r = reflect( pos.xyz, n.xyz );							\n\
		float m = sqrt( r.x*r.x + r.y*r.y + (r.z+1.0)*(r.z+1.0) ); \n\
															\n\
		//	texture coordinates								\n\
		v_texCoord1 = vTexCoord1.st;						\n\
		v_texCoord2.x = (r.x / (2.0 * m)  + 0.5);						\n\
		v_texCoord2.y = (r.y / (2.0 * m)  + 0.5);						\n\
    }														\n\
	";	
	
	
	// same shader as before, but now with light
CL3D.Renderer.prototype.vs_shader_reflectiontransform_with_light = "		\
	uniform mat4 worldviewproj;									\n\
	uniform mat4 normaltransform;								\n\
	uniform mat4 modelviewtransform;							\n\
	uniform vec4 arrLightPositions[4];							\n\
	uniform vec4 arrLightColors[5]; 							\n\
	uniform vec3 vecDirLight; 									\n\
	uniform vec4 colorDirLight; 								\n\
																\
	attribute vec4 vPosition;									\
    attribute vec3 vNormal;										\
    attribute vec2 vTexCoord1;									\
	attribute vec2 vTexCoord2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        gl_Position = worldviewproj * vPosition;					\n\
																	\n\
		//	use reflection											\n\
		vec3 pos = normalize((modelviewtransform * vPosition).xyz);					\n\
		vec3 nt = normalize((normaltransform * vec4(vNormal, 1)).xyz);		\n\
		vec3 r = reflect( pos.xyz, nt.xyz );							\n\
		float m = sqrt( r.x*r.x + r.y*r.y + (r.z+1.0)*(r.z+1.0) ); \n\
		//	texture coordinates								\n\
		v_texCoord1 = vTexCoord1.st;						\n\
		v_texCoord2.x = r.x / (2.0 * m)  + 0.5;						\n\
		v_texCoord2.y = r.y / (2.0 * m)  + 0.5;						\n\
															\n\
		vec3 n = normalize(vec3(vNormal.xyz));					\
		vec4 currentLight = vec4(0.0, 0.0, 0.0, 1.0);	 		\
		for(int i=0; i<4; ++i)									\
		{														\
			vec3 lPos = vec3(arrLightPositions[i].xyz);			\
			vec3 vertexToLight = lPos - vec3(vPosition.xyz);	\
			float distance = length( vertexToLight );			\
			float distanceFact = 1.0 / (arrLightPositions[i].w * distance); \
			vertexToLight = normalize(vertexToLight); 			\
			float angle = max(0.0, dot(n, vertexToLight));		\
			float intensity = angle * distanceFact;				\
			currentLight = currentLight + vec4(arrLightColors[i].x*intensity, arrLightColors[i].y*intensity, arrLightColors[i].z*intensity, 1.0);		\
		}														\
		// directional light									\n\
		float dirlight = max(0.0, dot(n, vecDirLight));	\
		currentLight = currentLight + vec4(colorDirLight.x*dirlight, colorDirLight.y*dirlight, colorDirLight.z*dirlight, 1.0);		\
																\
		// ambient light										\n\
		currentLight = currentLight + arrLightColors[4];		\
		currentLight = max(currentLight, vec4(0.0,0.0,0.0,0.0));	\
		//v_color = currentLight;								\n\
		v_color = min(currentLight, vec4(1.0,1.0,1.0,1.0));		\
																\
    }														\n\
	";	

// normal mapped material		
CL3D.Renderer.prototype.vs_shader_normalmappedtransform = "				\
	uniform mat4 worldviewproj;									\n\
	uniform mat4 normaltransform;								\n\
	uniform mat4 worldtransform;								\n\
	uniform vec4 arrLightPositions[4];							\n\
	uniform vec4 arrLightColors[5]; 							\n\
																\n\
	attribute vec4 vPosition;									\n\
    attribute vec3 vNormal;										\n\
	attribute vec4 vColor;										\n\
    attribute vec2 vTexCoord1;									\n\
	attribute vec2 vTexCoord2;									\n\
	attribute vec3 vBinormal;									\n\
	attribute vec3 vTangent;									\n\
																\n\
	// Output:													\n\
    varying vec2 v_texCoord1;									\n\
	varying vec2 v_texCoord2;									\n\
	varying vec3 v_lightVector[4];								\n\
	varying vec3 v_lightColor[4];								\n\
	varying vec3 ambientLight;									\n\
																\n\
    void main()													\n\
    {															\n\
        gl_Position = worldviewproj * vPosition;				\n\
        v_texCoord1 = vTexCoord1.st;							\n\
		v_texCoord2 = vTexCoord2.st;							\n\
																\n\
		vec4 pos = vec4(dot(vPosition, worldtransform[0]), dot(vPosition, worldtransform[1]), dot(vPosition, worldtransform[2]), dot(vPosition, worldtransform[3]));							\n\
																\n\
		// transform normal, binormal and tangent					\n\
		vec3 normal = vec3(dot(vNormal.xyz, worldtransform[0].xyz), dot(vNormal.xyz, worldtransform[1].xyz), dot(vNormal.xyz, worldtransform[2].xyz));		\n\
		vec3 tangent = vec3(dot(vTangent.xyz, worldtransform[0].xyz), dot(vTangent.xyz, worldtransform[1].xyz), dot(vTangent.xyz, worldtransform[2].xyz));     \n\
		vec3 binormal = vec3(dot(vBinormal.xyz, worldtransform[0].xyz), dot(vBinormal.xyz, worldtransform[1].xyz), dot(vBinormal.xyz, worldtransform[2].xyz));     \n\
																\n\
		vec3 temp = vec3(0.0, 0.0, 0.0);						\n\
		for(int i=0; i<4; ++i) 									\n\
		{														\n\
			vec3 lightPos = vec3(arrLightPositions[i].xyz);		\n\
			vec3 vertexToLight = lightPos - vec3(pos.xyz); \n\
																\
			// transform the light vector 1 with U, V, W		\n\
			temp.x = dot(tangent.xyz, vertexToLight);				\n\
			temp.y = dot(binormal.xyz, vertexToLight);				\n\
			temp.z = dot(normal.xyz, vertexToLight);				\n\
																\n\
			// normalize light vector					\n\
			temp = normalize(temp); 					\n\
																\n\
			// move from -1..1 to 0..1 and put into output		\n\
			temp = temp * 0.5;							\n\
			temp = temp + vec3(0.5,0.5,0.5);			\n\
			v_lightVector[i] = temp;				\n\
														\n\
			// calculate attenuation					\n\
			float distanceFact = 1.0 / sqrt(dot(vertexToLight, vertexToLight) * arrLightPositions[i].w); \n\
			v_lightColor[i] = min(vec3(arrLightColors[i].x*distanceFact, arrLightColors[i].y*distanceFact, arrLightColors[i].z*distanceFact), vec3(1,1,1));		\n\
		}														\n\
		// ambient light\n\
		ambientLight = arrLightColors[4].xyz;				\n\
    }															\n\
	";	
	
CL3D.Renderer.prototype.fs_shader_onlyfirsttexture = "				\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord = vec2(v_texCoord1.s, v_texCoord1.t);		\
        gl_FragColor = texture2D(texture1, texCoord);			\
    }															\
	";							

CL3D.Renderer.prototype.fs_shader_onlyfirsttexture_gouraud	 = "	\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord = vec2(v_texCoord1.s, v_texCoord1.t);		\
        gl_FragColor = texture2D(texture1, texCoord) * v_color;	\n\
    }															\
	";			

CL3D.Renderer.prototype.fs_shader_onlyfirsttexture_gouraud_alpharef	= "		\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord = vec2(v_texCoord1.s, v_texCoord1.t);		\
        gl_FragColor = texture2D(texture1, texCoord) * v_color;	\
		if(gl_FragColor.a < 0.5)								\
			discard;											\
    }															\
	";
	
CL3D.Renderer.prototype.fs_shader_lightmapcombine = "				\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord1 = vec2(v_texCoord1.s, v_texCoord1.t);	\
		vec2 texCoord2 = vec2(v_texCoord2.s, v_texCoord2.t);	\
        vec4 col1 = texture2D(texture1, texCoord1);				\
		vec4 col2 = texture2D(texture2, texCoord2);				\
		gl_FragColor = col1 * col2;								\
    }															\
	";		

CL3D.Renderer.prototype.fs_shader_lightmapcombine_m4 = "		\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord1 = vec2(v_texCoord1.s, v_texCoord1.t);	\
		vec2 texCoord2 = vec2(v_texCoord2.s, v_texCoord2.t);	\
        vec4 col1 = texture2D(texture1, texCoord1);				\
		vec4 col2 = texture2D(texture2, texCoord2);				\
		gl_FragColor = col1 * col2 * 3.0;						\
    }															\
	";			
	
CL3D.Renderer.prototype.fs_shader_lightmapcombine_gouraud = "	\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord1 = vec2(v_texCoord1.s, v_texCoord1.t);	\
		vec2 texCoord2 = vec2(v_texCoord2.s, v_texCoord2.t);	\
        vec4 col1 = texture2D(texture1, texCoord1);				\
		vec4 col2 = texture2D(texture2, texCoord2);				\
		vec4 final = col1 * col2 * v_color;						\
		gl_FragColor = vec4(final.x, final.y, final.z, col1.w);	\
    }															\
	";		
	
CL3D.Renderer.prototype.fs_shader_normalmapped	 = "	\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
	varying vec3 v_lightVector[4];								\
	varying vec3 v_lightColor[4];								\
	varying vec3 ambientLight;									\
																\
    void main()													\
    {															\
		vec4 colorMapSample = texture2D(texture1, v_texCoord1);	\
		vec3 normalMapVector = texture2D(texture2, v_texCoord1).xyz;\
		//normalMapVector -= vec3(0.5, 0.5, 0.5);					\n\
		//normalMapVector = normalize(normalMapVector); 			\n\
		normalMapVector *= vec3(2.0, 2.0, 2.0);					\n\
		normalMapVector -= vec3(1.0, 1.0, 1.0);					\n\
																\n\
		vec3 totallight = vec3(0.0, 0.0, 0.0);						\n\
		for(int i=0; i<4; ++i) 									\n\
		{														\n\
			// process light									\n\
			//vec3 lightvect = v_lightVector[i] + vec3(-0.5, -0.5, -0.5); \n\
			vec3 lightvect = (v_lightVector[i] * vec3(2.0, 2.0, 2.0)) - vec3(1.0, 1.0, 1.0); \n\
			lightvect = normalize(lightvect);					\n\
			float luminance = dot(lightvect, normalMapVector); // normal DOT light		\n\
			luminance = clamp(luminance, 0.0, 1.0);	// clamp result to positive numbers		\n\
			lightvect = luminance * v_lightColor[i];	// luminance * light color \n\
																\n\
			// add to previously calculated lights				\n\
			totallight = totallight + lightvect;				\n\
		}														\n\
																\n\
		totallight = totallight + ambientLight;					\n\
		gl_FragColor = colorMapSample * vec4(totallight.x, totallight.y, totallight.z, 0.0);	\n\
    }															\n\
	";
	
CL3D.Renderer.prototype.fs_shader_vertex_alpha_two_textureblend	 = "	\
	uniform sampler2D texture1;									\
	uniform sampler2D texture2;									\
																\
	varying vec4 v_color;										\
    varying vec2 v_texCoord1;									\
	varying vec2 v_texCoord2;									\
																\
    void main()													\
    {															\
        vec2 texCoord = vec2(v_texCoord1.s, v_texCoord1.t);		\
		vec4 color1 = texture2D(texture1, texCoord);			\
		vec4 color2 = texture2D(texture2, texCoord);			\
		color1 = ((1.0 - v_color.w) * color1) + (v_color.w * color2);	// interpolate texture colors based on vertex alpha	 \n\
		gl_FragColor = color1 * v_color;		\n\
    }															\
	";	
	
// shader for lighting
//vec3 lightDir = vec3(1.0, 1.0, 0.0);					\n\
//vec4 transNormal = normaltransform * vec4(vNormal, 1);		\n\
//v_Dot = max(dot(transNormal.xyz, lightDir), 0.0);		\n\