$ErrorActionPreference = "Stop"

function To-Str($codes) {
    $chars = foreach ($c in $codes) { [char]$c }
    return -join $chars
}

$padOldName = To-Str @(0x5c3f, 0x53d6, 0x308a, 0x30d1, 0x30c3, 0x30c9, 0x20, 0x34, 0x56de, 0x5206)
$padNewName = To-Str @(0x5c3f, 0x53d6, 0x308a, 0x30d1, 0x30c3, 0x30c9)
$widePadName = To-Str @(0x30ef, 0x30a4, 0x30c9, 0x30d1, 0x30c3, 0x30c9)
$gloveSName = To-Str @(0x4f7f, 0x3044, 0x6368, 0x3066, 0x30d7, 0x30e9, 0x30b9, 0x30c1, 0x30c3, 0x30af, 0x624b, 0x888b, 0x20, 0x53)
$gloveMName = To-Str @(0x4f7f, 0x3044, 0x6368, 0x3066, 0x30d7, 0x30e9, 0x30b9, 0x30c1, 0x30c3, 0x30af, 0x624b, 0x888b, 0x20, 0x4d)
$gloveLName = To-Str @(0x4f7f, 0x3044, 0x6368, 0x3066, 0x30d7, 0x30e9, 0x30b9, 0x30c1, 0x30c3, 0x30af, 0x624b, 0x888b, 0x20, 0x4c)
$catDiaper = To-Str @(0x30aa, 0x30e0, 0x30c4, 0x30fb, 0x30d1, 0x30c3, 0x30c9)
$catHygiene = To-Str @(0x885b, 0x751f, 0x7528, 0x54c1)
$unitPack = To-Str @(0x30d1, 0x30c3, 0x30af)
$unitBox = To-Str @(0x7bb1)
$careSuppName = To-Str @(0x30b1, 0x30a2, 0x30b5, 0x30dd, 0x30fc, 0x30c8, 0x5546, 0x4e8b)

$dbFile = "data/portal_database.json"
if (Test-Path $dbFile) {
    $json = [System.IO.File]::ReadAllText($dbFile, [System.Text.Encoding]::UTF8)
    $db = $json | ConvertFrom-Json

    # 1. Update inventory
    # Remove any broken items id 401, 402, 403 first
    $db.inventory = @($db.inventory | Where-Object { $_.id -ne 401 -and $_.id -ne 402 -and $_.id -ne 403 })

    foreach ($item in $db.inventory) {
        if ($item.name -eq $padOldName) {
            $item.name = $padNewName
        }
    }

    # Add widePad (401)
    $newItem = [PSCustomObject]@{
        id = 401
        name = $widePadName
        category = $catDiaper
        current_stock = 4
        safety_stock = 5
        normal_stock = 10
        unit = $unitPack
        unit_price = 1600
        is_personal_billable = 1
        supplier_id = 1
        supplier_name = $careSuppName
    }
    $db.inventory += $newItem

    # Add glove S (402)
    $newItemS = [PSCustomObject]@{
        id = 402
        name = $gloveSName
        category = $catHygiene
        current_stock = 12
        safety_stock = 8
        normal_stock = 16
        unit = $unitBox
        unit_price = 650
        is_personal_billable = 0
        supplier_id = 1
        supplier_name = $careSuppName
    }
    $db.inventory += $newItemS

    # Add glove L (403)
    $newItemL = [PSCustomObject]@{
        id = 403
        name = $gloveLName
        category = $catHygiene
        current_stock = 10
        safety_stock = 8
        normal_stock = 16
        unit = $unitBox
        unit_price = 650
        is_personal_billable = 0
        supplier_id = 1
        supplier_name = $careSuppName
    }
    $db.inventory += $newItemL

    # 2. Update suppliers
    if ($db.suppliers -and $db.suppliers.Count -gt 0) {
        $careSupp = $db.suppliers[0]
        foreach ($i in $careSupp.items) {
            if ($i.name -eq $padOldName) {
                $i.name = $padNewName
            }
        }
        # filter out any corrupted entries
        $careSupp.items = @($careSupp.items | Where-Object { $_.name -ne "" -and $_.name -ne $null -and $_.name -ne $widePadName -and $_.name -ne $gloveSName -and $_.name -ne $gloveLName })
        $careSupp.items += [PSCustomObject]@{
            name = $widePadName
            unit_price = 1600
            unit = $unitPack
        }
        $careSupp.items += [PSCustomObject]@{
            name = $gloveSName
            unit_price = 650
            unit = $unitBox
        }
        $careSupp.items += [PSCustomObject]@{
            name = $gloveLName
            unit_price = 650
            unit = $unitBox
        }
    }

    # 3. Update orders, consumptions, inventory_logs
    if ($db.inventory_logs) {
        foreach ($log in $db.inventory_logs) {
            if ($log.item_name -eq $padOldName) {
                $log.item_name = $padNewName
            }
        }
    }
    if ($db.consumptions) {
        foreach ($con in $db.consumptions) {
            if ($con.item_name -eq $padOldName) {
                $con.item_name = $padNewName
            }
        }
    }
    if ($db.orders) {
        foreach ($ord in $db.orders) {
            if ($ord.item_name -eq $padOldName) {
                $ord.item_name = $padNewName
            }
        }
    }

    $updatedJson = $db | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($dbFile, $updatedJson, [System.Text.Encoding]::UTF8)
    Write-Host "[PASS] portal_database.json cleanly updated with new inventory items"
}
