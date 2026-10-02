$ErrorActionPreference = "Continue"

# Wikimedia Commons headers
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", "CarePortalApp/1.0 (Mozilla/5.0; CareFacilityTest)")

# 1. 田中ハナ様用 (上品な高齢女性の写真)
# Kyoto bus stop elderly woman
$urlTanaka = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Elderly_Woman_at_Bus_Stop_-_Kyoto_-_Japan_%2847929398876%29.jpg/800px-Elderly_Woman_at_Bus_Stop_-_Kyoto_-_Japan_%2847929398876%29.jpg"
try {
    $wc.DownloadFile($urlTanaka, "data\photos\personal\photo_tanaka_raw.jpg")
    Write-Host "Downloaded Tanaka photo successfully."
} catch {
    Write-Host "Failed Tanaka: $_"
}

# 2. 高橋トメ様用 (明るく元気な高齢女性の写真)
$urlTome = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Elderly_Woman_with_Cane_-_Furano_-_Hokkaido_-_Japan_%2848012228898%29.jpg/800px-Elderly_Woman_with_Cane_-_Furano_-_Hokkaido_-_Japan_%2848012228898%29.jpg"
try {
    $wc.DownloadFile($urlTome, "data\photos\personal\photo_takahashi_raw.jpg")
    Write-Host "Downloaded Takahashi photo successfully."
} catch {
    Write-Host "Failed Takahashi: $_"
}

# 3. 鈴木一郎様用 (穏やかな高齢男性の写真)
$urlSuzuki = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Japanese_Man-Elderly.JPG/800px-Japanese_Man-Elderly.JPG"
try {
    $wc.DownloadFile($urlSuzuki, "data\photos\personal\photo_suzuki_raw.jpg")
    Write-Host "Downloaded Suzuki photo successfully."
} catch {
    Write-Host "Failed Suzuki: $_"
}
