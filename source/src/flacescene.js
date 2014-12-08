//+ Nikolaus Gebhardt
// This file is part of the CopperLicht library, copyright by Nikolaus Gebhardt

//public static const REDRAW_WHEN_CAM_MOVED:int = 0;
//public static const REDRAW_WHEN_SCENE_CHANGED:int = 1;
//public static const REDRAW_EVERY_FRAME:int = 2;

//public static const REGISTER_MODE_DEFAULT:int = 0;
//public static const REGISTER_MODE_SKYBOX:int = 1;
//public static const REGISTER_MODE_CAMERA:int = 2;
//public static const REGISTER_MODE_LIGHTS:int = 3;
//public static const REGISTER_MODE_2DOVERLAY:int = 4;
		
/**
 * @constructor
 * @class A 3d scene, containing all {@link SceneNode}s.
 * The scene holds all {@link SceneNode}s and is able to draw and animate them.
 */
CL3D.Scene = function()
{
	this.init();
}

/**
 * Initializes the scene node, can be called by scene nodes derived from this class.
 * @private
 */
CL3D.Scene.prototype.init = function()
{
	this.RootNode = new CL3D.SceneNode();
	this.RootNode.scene = this;
	this.Name = '';
	this.BackgroundColor = 0;
	this.CollisionWorld = null;
	
	this.AmbientLight = new CL3D.ColorF();
	this.AmbientLight.R = 0.0;
	this.AmbientLight.G = 0.0;
	this.AmbientLight.B = 0.0;
	
	this.Gravity = 1.0;
	
	// scene manager related
	this.LastUsedRenderer = null;
	this.StartTime = 0;
	this.ActiveCamera = null;
	this.ForceRedrawThisFrame = false;
	this.LastViewProj = new CL3D.Matrix4();
	this.TheSkyBoxSceneNode = null;
	this.RedrawMode = 2;
	
	this.CurrentRenderMode = 0;
	this.SceneNodesToRender = new Array();
	this.SceneNodesToRenderTransparent = new Array();
	this.LightsToRender = new Array();
	this.Overlay2DToRender = new Array();
	this.RegisteredSceneNodeAnimatorsForEventsList = new Array();
	
	this.NodeCountRenderedLastTime = 0;
	this.SkinnedMeshesRenderedLastTime = 0;
	this.UseCulling = false;
	this.CurrentCameraFrustrum = null;
		
	// runtime
	this.WasAlreadyActivatedOnce = false;
	this.DeletionList = new Array();
	this.LastBulletImpactPosition = new CL3D.Vect3d; // hack for IRR_SCENE_MANAGER_LAST_BULLET_IMPACT_POSITION parameter
}

/**
  * Returns the type string of the current scene.
  * @private
*/
CL3D.Scene.prototype.getCurrentCameraFrustrum = function()
{
	return this.CurrentCameraFrustrum;
}


/**
  * Returns the type string of the current scene.
  * @public
*/
CL3D.Scene.prototype.getSceneType = function()
{
	return "unknown";
}


/**
  * returns true if rendering needs to be done at all
  * @private
*/
CL3D.Scene.prototype.doAnimate = function(renderer)
{
	this.LastUsedRenderer = renderer;
		
	if (this.StartTime == 0)
		this.StartTime = CL3D.CLTimer.getTime();
	
	// clear
	this.TheSkyBoxSceneNode = null;
	
	// animate 
	
	var sceneChanged = false;
	
	if (this.clearDeletionList(false)) 
		sceneChanged = true;
		
	if (this.RootNode.OnAnimate(this, CL3D.CLTimer.getTime()))
		sceneChanged = true;
		
	var viewHasChanged = this.HasViewChangedSinceLastRedraw();
	var textureLoadWasFinished = renderer ? renderer.getAndResetTextureWasLoadedFlag() : false;
	
	// check if we need to redraw at all
	
	var needToRedraw = 
		this.ForceRedrawThisFrame ||
		(this.RedrawMode == 0 /*REDRAW_WHEN_CAM_MOVED*/ && (viewHasChanged || textureLoadWasFinished)) ||
		(this.RedrawMode == 1 /*REDRAW_WHEN_SCENE_CHANGED*/ && (viewHasChanged || sceneChanged || textureLoadWasFinished)) ||
		(this.RedrawMode == 2 /*REDRAW_EVERY_FRAME*/) ||
		CL3D.ScriptingInterface.getScriptingInterface().needsRedraw();
	
	if (!needToRedraw)
	{
		//Debug.print("Don't need to redraw at all.");				
		return false;	
	}
	
	this.ForceRedrawThisFrame = false;
	return true;
}



/**
  * Returns the current mode of rendering, can be for example {@link Scene.RENDER_MODE_TRANSPARENT}.
  * Is useful for scene nodes which render themselves for example both solid and transparent.
  * @public
*/
CL3D.Scene.prototype.getCurrentRenderMode = function()
{
	return this.CurrentRenderMode;
}


/**
 * Draws and animates the whole 3D scene. Not necessary to call usually, CopperLicht is doing this
 * itself by default.
 * @param {CL3D.Renderer} renderer used for drawing. 
 */
CL3D.Scene.prototype.drawAll = function(renderer)
{
	// register for rendering
	this.SceneNodesToRender = new Array();
	this.SceneNodesToRenderTransparent = new Array();
	this.LightsToRender = new Array();
	this.Overlay2DToRender = new Array();
	this.RootNode.OnRegisterSceneNode(this);
	this.CurrentCameraFrustrum = null;
	this.SkinnedMeshesRenderedLastTime = 0;
	
	// active camera
	this.CurrentRenderMode = CL3D.Scene.RENDER_MODE_CAMERA;
	var camPos = null;
	if (this.ActiveCamera)
	{
		camPos = this.ActiveCamera.getAbsolutePosition();
		this.ActiveCamera.render(renderer);
	}
		
	// skybox 
	this.CurrentRenderMode = CL3D.Scene.RENDER_MODE_SKYBOX;
	if (this.SkyBoxSceneNode)
		this.SkyBoxSceneNode.render(renderer);
		
	renderer.clearDynamicLights();
	renderer.AmbientLight = this.AmbientLight.clone();
	
	var i; // i
	var nodesRendered = 0;
	
	// draw lights	
	
	// sort lights
	
	if (camPos != null && this.LightsToRender.length > 0)
	{
		this.LightsToRender.sort(function(a,b)
			{
				var distance1 = camPos.getDistanceFromSQ(a.getAbsolutePosition());
				var distance2 = camPos.getDistanceFromSQ(b.getAbsolutePosition());
				if ( distance1 > distance2 )
					return 1;
				if ( distance1 < distance2 )
					return -1;
				return 0;
			} );
	}
	
	this.CurrentRenderMode = CL3D.Scene.RENDER_MODE_LIGHTS;
	
	for (i= 0; i<this.LightsToRender.length; ++i)
		this.LightsToRender[i].render(renderer);
	
	nodesRendered += this.LightsToRender.length;
	
	// prepare for frustrum culling
	
	var cullingBox = null;
		
	{
		var frustrum = null;		
		var proj = renderer.getProjection();
		var view = renderer.getView();
		
		if (proj != null && view != null && camPos != null)
		{
			frustrum = new CL3D.ViewFrustrum();
			frustrum.setFrom(proj.multiply(view)); // calculate view frustum planes
			
			if (this.UseCulling)
				cullingBox = frustrum.getBoundingBox(camPos);
		}
		
		this.CurrentCameraFrustrum = frustrum;
	}	
	
	// draw nodes

	this.CurrentRenderMode = CL3D.Scene.RENDER_MODE_DEFAULT;
	
	for (i= 0; i<this.SceneNodesToRender.length; ++i)
	{
		var s = this.SceneNodesToRender[i];
		if (cullingBox == null || cullingBox.intersectsWithBox(s.getTransformedBoundingBox()))
		{
			s.render(renderer);
			nodesRendered += 1;
		}
	}
	
	// draw transparent nodes
	this.CurrentRenderMode = CL3D.Scene.RENDER_MODE_TRANSPARENT;
	
	// sort transparent nodes
	
	if (camPos != null && this.SceneNodesToRenderTransparent.length > 0)
	{
		this.SceneNodesToRenderTransparent.sort(function(a,b)
			{
				var distance1 = camPos.getDistanceFromSQ(a.getAbsolutePosition());
				var distance2 = camPos.getDistanceFromSQ(b.getAbsolutePosition());
				if ( distance1 < distance2 )
					return 1;
				if ( distance1 > distance2 )
					return -1;
				return 0;
			} );
	}
	
	// draw them
	
	for (i= 0; i<this.SceneNodesToRenderTransparent.length; ++i)
	{
		var s = this.SceneNodesToRenderTransparent[i];
		if (cullingBox == null || cullingBox.intersectsWithBox(s.getTransformedBoundingBox()))
		{
			s.render(renderer);
			nodesRendered += 1;
		}
	}
	
	// draw overlays
	this.CurrentRenderMode = CL3D.Scene.RENDER_MODE_2DOVERLAY;
	for (i= 0; i<this.Overlay2DToRender.length; ++i)
	{
		this.Overlay2DToRender[i].render(renderer);
	}
	
	nodesRendered += this.Overlay2DToRender.length;
	
	this.NodeCountRenderedLastTime = nodesRendered;	
	this.StoreViewMatrixForRedrawCheck();
}


/**
 * @private
 */
CL3D.Scene.prototype.HasViewChangedSinceLastRedraw = function()
{
	if (!this.ActiveCamera)
		return true;
		
	var mat = new CL3D.Matrix4(false);
	this.ActiveCamera.Projection.copyTo(mat);
	mat = mat.multiply(this.ActiveCamera.ViewMatrix);
	
	return !mat.equals(this.LastViewProj);
}

/**
 * @private
 */
CL3D.Scene.prototype.StoreViewMatrixForRedrawCheck = function()
{
	if (!this.ActiveCamera)
		return;
		
	this.ActiveCamera.Projection.copyTo(this.LastViewProj);
	this.LastViewProj = this.LastViewProj.multiply(this.ActiveCamera.ViewMatrix);
}

/**
 * @private
 */
CL3D.Scene.prototype.getLastUsedRenderer = function()
{
	return this.LastUsedRenderer;
}

/**
 * Sets the background color for the scene
 * @param clr {Number} New color. See {@link CL3D.createColor} on how to create such a color value.
 * @public
 */
CL3D.Scene.prototype.setBackgroundColor = function(clr)
{
	this.BackgroundColor = clr;
}

/**
 * Gets the background color of the scene
 * @returns {Number} Background color. See {@link CL3D.createColor} on how to create such a color value.
 * @public
 */
CL3D.Scene.prototype.getBackgroundColor = function()
{
	return this.BackgroundColor;
}

/**
 * Returns the name of the scene
 * @public
 */
CL3D.Scene.prototype.getName = function()
{
	return this.Name;
}

/**
 * Sets the name of the scene
 * @public
 */
CL3D.Scene.prototype.setName = function(name)
{
	this.Name = name;
}


/**
 * Specifies when the scene should be redrawn.
 * @param mode Possible values are {@link CL3D.Scene.REDRAW_WHEN_CAM_MOVED}, 
 * {@link CL3D.Scene.REDRAW_WHEN_SCENE_CHANGED} and {@link CL3D.Scene.REDRAW_EVERY_FRAME}.
 * @public
 */
CL3D.Scene.prototype.setRedrawMode = function(mode)
{
	this.RedrawMode = mode;
}

/**
 * Sets the currently active {CL3D.CameraSceneNode} in the scene.
 * @param {CL3D.CameraSceneNode} activeCamera The new active camera
 * @public
 */
CL3D.Scene.prototype.setActiveCamera = function(activeCamera)
{
	this.ActiveCamera = activeCamera;
}	

/**
 * Returns the currently active {CL3D.CameraSceneNode} in the scene.
 * @returns {CL3D.CameraSceneNode} active camera
 * @public
 */
CL3D.Scene.prototype.getActiveCamera = function()
{
	return this.ActiveCamera;
}			

/**
 * Forces the renderer to redraw this scene the next frame, independent of the currently used redraw mode.
 * @public
 */
CL3D.Scene.prototype.forceRedrawNextFrame = function()
{
	this.ForceRedrawThisFrame = true;
}


/**
 * Returns the start time in milliseconds of this scene. Useful for {@link Animators}.
 * @public
 */
CL3D.Scene.prototype.getStartTime = function()
{
	return this.StartTime;
}

/**
 * Used for Scene nodes to register themselves for rendering
 * When called {@link SceneNode.OnRegisterSceneNode}, a scene node should call
 * this method to register itself for rendering if it decides that it wants to be rendered.
 * In this way, scene nodes can be rendered in the optimal order.
 * @param {CL3D.SceneNode} s Node which registers itself for rendering
 * @param {Integer} mode render mode the scene node wishes to register itself. Usually, use {@link CL3D.Scene.RENDER_MODE_DEFAULT}. For
 * transparent nodes, {@link CL3D.Scene.RENDER_MODE_TRANSPARENT} is ideal.
 * @public
 */
CL3D.Scene.prototype.registerNodeForRendering = function(s, mode)
{
	if (mode == null)
		mode = CL3D.Scene.RENDER_MODE_DEFAULT;
		
	switch(mode)
	{
	case CL3D.Scene.RENDER_MODE_SKYBOX:
		this.SkyBoxSceneNode = s;
		break;
	case CL3D.Scene.RENDER_MODE_DEFAULT:
		this.SceneNodesToRender.push(s);
		break;
	case CL3D.Scene.RENDER_MODE_LIGHTS:
		this.LightsToRender.push(s);
		break;
	case CL3D.Scene.RENDER_MODE_CAMERA:
		// ignore for now
		break;
	case CL3D.Scene.RENDER_MODE_TRANSPARENT:
		this.SceneNodesToRenderTransparent.push(s);
		break;
	case CL3D.Scene.RENDER_MODE_2DOVERLAY:
		this.Overlay2DToRender.push(s);
		break;
	}
}

/**
 * Returns all scene nodes in this scene with the specified type {@link SceneNode}s.
 * @public
 * @param type {String} type name of the {@link SceneNode}. See {@link SceneNode}.getType().
 * @returns {Array} array with all scene nodes found with this type.
 */
CL3D.Scene.prototype.getAllSceneNodesOfType = function(type)
{
	if (this.RootNode == null)
		return null;
		
	var ar = new Array();
	this.getAllSceneNodesOfTypeImpl(this.RootNode, type, ar);
	return ar;
}
		
/**
 * @private
 */
CL3D.Scene.prototype.getAllSceneNodesOfTypeImpl = function(n, c, a)
{
	if (n.getType() == c)
		a.push(n);
		
	for (var i = 0; i<n.Children.length; ++i)
	{				
		var child = n.Children[i];
		this.getAllSceneNodesOfTypeImpl(child, c, a);
	}
}

/**
 * Returns all scene nodes in this scene with the specified animator type {@link SceneNode}s.
 * @private
 * @param type {String} type name of the animator
 * @returns {Array} array with all scene nodes found with this type.
 */
CL3D.Scene.prototype.getAllSceneNodesWithAnimator = function(type)
{
	if (this.RootNode == null)
		return null;
		
	var ar = new Array();
	this.getAllSceneNodesWithAnimatorImpl(this.RootNode, type, ar);
	return ar;
}

/**
 * @private
 */
CL3D.Scene.prototype.getAllSceneNodesWithAnimatorImpl = function(n, t, a)
{
	if (n.getAnimatorOfType(t) != null)
		a.push(n);
		
	for (var i = 0; i<n.Children.length; ++i)
	{				
		var child = n.Children[i];
		this.getAllSceneNodesWithAnimatorImpl(child, t, a);
	}
}

/**
 * Returns the first {@link SceneNode} in this scene with the specified name.
 * @public
 * @param name {String} name of the {@link SceneNode}. See {@link SceneNode}.getName().
 * @returns {CL3D.SceneNode} the found scene node or null if not found.
 */
CL3D.Scene.prototype.getSceneNodeFromName = function(name)
{
	if (this.RootNode == null)
		return null;
		
	return this.getSceneNodeFromNameImpl(this.RootNode, name);
}
		
/**
 * @private
 */
CL3D.Scene.prototype.getSceneNodeFromNameImpl = function(n, name)
{
	if (n.Name == name)
		return n;
		
	for (var i = 0; i<n.Children.length; ++i)
	{				
		var child = n.Children[i];
		var s = this.getSceneNodeFromNameImpl(child, name);
		if (s)
			return s;
	}
	
	return null;
}

/**
 * Returns the first {@link SceneNode} in this scene with the specified id.
 * @public
 * @param id {Number} name of the {@link SceneNode}. See {@link SceneNode}.getId().
 * @returns {CL3D.SceneNode} the found scene node or null if not found.
 */
CL3D.Scene.prototype.getSceneNodeFromId = function(id)
{
	if (this.RootNode == null)
		return null;
		
	return this.getSceneNodeFromIdImpl(this.RootNode, id);
}
		
/**
 * @private
 */
CL3D.Scene.prototype.getSceneNodeFromIdImpl = function(n, id)
{
	if (n.Id == id)
		return n;
		
	for (var i = 0; i<n.Children.length; ++i)
	{				
		var child = n.Children[i];
		var s = this.getSceneNodeFromIdImpl(child, id);
		if (s)
			return s;
	}
	
	return null;
}

/**
 * Returns the root {@link SceneNode}, the root of the whole scene graph.
 * @public
 * @returns {CL3D.SceneNode} The root scene node.
 */
CL3D.Scene.prototype.getRootSceneNode = function()
{
	return this.RootNode;
}

/**
 * @private 
 */
CL3D.Scene.prototype.registerSceneNodeAnimatorForEvents = function(a)
{
	if (a == null)
		return;
		
	for (var i=0; i<this.RegisteredSceneNodeAnimatorsForEventsList.length; ++i)
	{
		var s = this.RegisteredSceneNodeAnimatorsForEventsList[i];
		if (s === a)
			return;
	}
	
	this.RegisteredSceneNodeAnimatorsForEventsList.push(a);
}

/**
 * @private 
 */
CL3D.Scene.prototype.unregisterSceneNodeAnimatorForEvents = function(a)
{
	if (a == null)
		return;
		
	for (var i=0; i<this.RegisteredSceneNodeAnimatorsForEventsList.length; ++i)
	{
		var s = this.RegisteredSceneNodeAnimatorsForEventsList[i];
		if (s === a)
		{
			this.RegisteredSceneNodeAnimatorsForEventsList.splice(i, 1);
			return;
		}
	}
}

/**
 * @private 
 */
CL3D.Scene.prototype.postMouseWheelToAnimators = function(delta)
{
	for (var i=0; i<this.RegisteredSceneNodeAnimatorsForEventsList.length; ++i)
	{
		var s = this.RegisteredSceneNodeAnimatorsForEventsList[i];
		s.onMouseWheel(delta);
	}
}


/**
 * @private 
 */
CL3D.Scene.prototype.postMouseDownToAnimators = function(event)
{
	for (var i=0; i<this.RegisteredSceneNodeAnimatorsForEventsList.length; ++i)
	{
		var s = this.RegisteredSceneNodeAnimatorsForEventsList[i];
		s.onMouseDown(event);
	}
}

/**
 * @private 
 */
CL3D.Scene.prototype.postMouseUpToAnimators = function(event)
{
	for (var i=0; i<this.RegisteredSceneNodeAnimatorsForEventsList.length; ++i)
	{
		var s = this.RegisteredSceneNodeAnimatorsForEventsList[i];
		s.onMouseUp(event);
	}
}


/**
 * @private 
 */
CL3D.Scene.prototype.postMouseMoveToAnimators = function(event)
{
	for (var i=0; i<this.RegisteredSceneNodeAnimatorsForEventsList.length; ++i)
	{
		var s = this.RegisteredSceneNodeAnimatorsForEventsList[i];
		s.onMouseMove(event);
	}
}

/**
 * Returns the automatically generated collision geometry containing all scene nodes with had the collision flag set to true
 * in the editor.
 * @returns Returns a {@link MetaTriangleSelector} providing access to all to collision geomertry in this scene.
 */
 CL3D.Scene.prototype.getCollisionGeometry = function()
 {
	return this.CollisionWorld;
 }

/**
 * @private 
 * @param storeInNodes: Boolean, if set to true the selector for each node is stored in the scene nodes
 * @param selectorToReuse: Metatriangle selector, can be null. If not null, will be cleared and used to be filled with geometry
 * @returns Returns a meta triangle selector with the collision geomertry
 */
CL3D.Scene.prototype.createCollisionGeometry = function(storeInNodes, selectorToReuse)
{
	var ar = this.getAllSceneNodesOfType('mesh');
	if (ar == null)
		return null;
		
	var metaselector = null;
	if (selectorToReuse)
	{
		selectorToReuse.clear();
		metaselector = selectorToReuse;
	}
	else
	{
		metaselector = new CL3D.MetaTriangleSelector();
	}
	
	// static meshes 
	
	for (var i=0; i<ar.length; ++i)
	{
		var fnode = ar[i];
		
		if (fnode && fnode.DoesCollision)
		{
			var selector = null;
			
			if (fnode.Selector)
				selector = fnode.Selector;
			else
			{
				var materialTypeToIgnore = null;
				if (fnode.Parent && fnode.Parent.getType() == 'terrain')
					materialTypeToIgnore = CL3D.Material.EMT_TRANSPARENT_ALPHA_CHANNEL_REF;
				
				if (fnode.OwnedMesh && fnode.OwnedMesh.GetPolyCount() > 100)
					selector = new CL3D.OctTreeTriangleSelector(fnode.OwnedMesh, fnode, 64, materialTypeToIgnore);
				else
					selector = new CL3D.MeshTriangleSelector(fnode.OwnedMesh, fnode, materialTypeToIgnore);
			}
			
			if (storeInNodes && fnode.Selector == null)
				fnode.Selector = selector;
			
			metaselector.addSelector(selector);
		}
	}
	
	// static animated meshes
	
	ar = this.getAllSceneNodesOfType('animatedmesh');
	
	for (var i=0; i<ar.length; ++i)
	{
		var fanimnode = ar[i];
		
		if (fanimnode && fanimnode.Mesh && fanimnode.Mesh.isStatic() &&
		     fanimnode.Mesh.StaticCollisionBoundingBox &&
		    !fanimnode.Mesh.StaticCollisionBoundingBox.isEmpty() )
		{
			var selector = null;
			
			if (fanimnode.Selector)
				selector = fanimnode.Selector;
			else
				selector = new CL3D.BoundingBoxTriangleSelector(fanimnode.Mesh.StaticCollisionBoundingBox, fanimnode);
			
			if (storeInNodes && fanimnode.Selector == null)
				fanimnode.Selector = selector;
			
			metaselector.addSelector(selector);
		}
	}
	
	return metaselector;
}

/** 
 @private
*/ 
CL3D.Scene.prototype.addToDeletionQueue = function(node, afterTimeMs)
{
	var e = new Object();
	e.node = node;
	e.timeAfterToDelete = afterTimeMs + CL3D.CLTimer.getTime();

	this.DeletionList.push(e);
}

/** 
 @private
*/ 
CL3D.Scene.prototype.clearDeletionList = function(deleteAll)
{
	if (this.DeletionList.length == 0)
		return false;
		
	var now = CL3D.CLTimer.getTime();
	var ret = false;
	
	for (var i=0; i<this.DeletionList.length;)
	{
		var e = this.DeletionList[i];
		
		if (deleteAll || e.timeAfterToDelete < now)
		{
			if (e.node.Parent)
				e.node.Parent.removeChild(e.node);
			this.DeletionList.splice(i, 1);
			ret = true;
			
			if (this.CollisionWorld && e.node.Selector)
				this.CollisionWorld.removeSelector(e.node.Selector);
		}
		else
			++i;
	}
	
	return ret;
}

/** 
 @private
*/ 
CL3D.Scene.prototype.isCoordOver2DOverlayNode = function(x, y, onlyThoseWhoBlockCameraInput)
{
	if (this.RootNode == null || this.LastUsedRenderer == null)
		return null;
		
	return this.isCoordOver2DOverlayNodeImpl(this.RootNode, x, y, onlyThoseWhoBlockCameraInput);
}

/** 
 @private
*/ 
CL3D.Scene.prototype.isCoordOver2DOverlayNodeImpl = function(n, x, y, onlyThoseWhoBlockCameraInput)
{
	if (n && n.Visible && (n.getType() == '2doverlay' || n.getType() == 'mobile2dinput'))
	{
		if (!onlyThoseWhoBlockCameraInput || (onlyThoseWhoBlockCameraInput && n.blocksCameraInput()))
		{
			var r = n.getScreenCoordinatesRect(true, this.LastUsedRenderer);
			if (r.x <= x && r.y <= y &&
				r.x + r.w >= x &&
				r.y + r.h >= y)
			{
				return n;
			}
		}
	}
		
	for (var i = 0; i<n.Children.length; ++i)
	{				
		var child = n.Children[i];
		var s = this.isCoordOver2DOverlayNodeImpl(child, x, y, onlyThoseWhoBlockCameraInput);
		if (s)
			return s;
	}
	
	return null;
}

/** 
 @private
*/ 
CL3D.Scene.prototype.getUnusedSceneNodeId = function()
{
	for (var tries=0; tries<1000; ++tries)
	{
		var testId = Math.round((Math.random()*10000)+10);
		
		if (this.getSceneNodeFromId(testId) == null)
			return testId;
	}
	
	return -1;
}


/** 
 @private
*/ 
CL3D.Scene.prototype.replaceAllReferencedNodes = function(nold, nnew)
{
	if (!nold || !nnew)
		return;
		
	for (var i=0; i<nold.getChildren().length && i<nnew.getChildren().length; ++i)
	{
		var cold = nold.getChildren()[i];
		var cnew = nnew.getChildren()[i];
		
		if (cold && cnew && cold.getType() == cnew.getType())
		{
			nnew.replaceAllReferencedNodes(cold, cnew);
		}
	}
	
	return -1;
}


/** 
 * Constant for using in {@link Scene.setRedrawMode}, specifying the scene should be redrawn only when the camera changed
 * @const 
 * @public
 */	
CL3D.Scene.REDRAW_WHEN_CAM_MOVED = 2;

/** 
 * Constant for using in {@link Scene.setRedrawMode}, specifying the scene should be redrawn only when the scene has changed
 * @const 
 * @public
 */	
CL3D.Scene.REDRAW_WHEN_SCENE_CHANGED = 1;

/** 
 * Constant for using in {@link Scene.setRedrawMode}, specifying the scene should be redrawn every frame.
 * @const 
 * @public
 */	
CL3D.Scene.REDRAW_EVERY_FRAME = 2;


/** 
 * Constant for using in {@link Scene.registerNodeForRendering}, specifying the render mode of a scene node.
 * @const 
 * @public
 */	
CL3D.Scene.RENDER_MODE_SKYBOX = 1;

/** 
 * Constant for using in {@link Scene.registerNodeForRendering}, specifying the render mode of a scene node.
 * @const 
 * @public
 */	
CL3D.Scene.RENDER_MODE_DEFAULT = 0;

/** 
 * Constant for using in {@link Scene.registerNodeForRendering}, specifying the render mode of a scene node.
 * @const 
 * @public
 */	
CL3D.Scene.RENDER_MODE_LIGHTS = 2;

/** 
 * Constant for using in {@link Scene.registerNodeForRendering}, specifying the render mode of a scene node.
 * @const 
 * @public
 */	
CL3D.Scene.RENDER_MODE_CAMERA = 3;

/** 
 * Constant for using in {@link Scene.registerNodeForRendering}, specifying the render mode of a scene node.
 * @const 
 * @public
 */	
CL3D.Scene.RENDER_MODE_TRANSPARENT = 4;

/** 
 * Constant for using in {@link Scene.registerNodeForRendering}, specifying the render mode of a scene node.
 * @const 
 * @public
 */	
CL3D.Scene.RENDER_MODE_2DOVERLAY = 5;