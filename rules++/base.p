
///////////////////////////////////////
// presets
///////////////////////////////////////
/******************************************************************************

*/
preset Clear()

    OverrideLayer();
    Insert(0);
end



preset FillObjects(array object aObjects)

//
    if (s:debug)
        if (aObjects.count == 0)
            warning("preset.FillObjects(array object " + aObjects.name() + ") -> " + aObjects.name() + " was empty, function had no effect.");
            return;
        end
    end
//

    for (i = 0 to aObjects.last)
        coord cAnchor = aObjects[i].anchor;

        for (j = 0 to aObjects[i].last)
            coord cRelativePos = util:RelativePos(cAnchor, aObjects[i][j]);

            Insert(aObjects[i][j]).If(
                IndexAt([cRelativePos.x * -1, cRelativePos.y * -1]).Is(cAnchor)
            ).NoDefaultPosRule();
        end
    end
end



preset Checkerboard(int iIndex1, int iIndex2)

//
    if (s:debug)
        if (iIndex1 < 0 or iIndex1 > 255)
            warning("preset.Checkerboard(int " + iIndex1.name() + ", int " + iIndex2.name() + ") -> " + iIndex1.name() + " needs to be in range [0-255].");
            return;
        end

        if (iIndex2 < 0 or iIndex2 > 255)
            warning("preset.Checkerboard(int " + iIndex1.name() + ", int " + iIndex2.name() + ") -> " + iIndex2.name() + " needs to be in range [0-255].");
            return;
        end
    end
//

    OverrideLayer();
    Insert(iIndex1);
    Insert(g:mask).If(
        IndexAt([0, 0]).IsEmpty(), IndexAt([-1, 0], [0, -1]).IsNot(g:mask, iIndex2)
    );
    Insert(iIndex2).If(
        IndexAt([0, 0]).Is(iIndex1), IndexAt([-1, 0], [0, -1]).IsNot(g:mask, iIndex2)
    );

    NewRun();
    OverrideLayer();
    Replace(g:mask, 0);
end
